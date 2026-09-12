import type { AiMorganPort } from "@/core/ports";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { SettleResponse } from "@x402/core/types";
import type { HexAddress, HexHash, PriceValidation, SignedPayment, Strategy, X402Quote } from "@/core/types";

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord =>
  typeof value === "object" && value !== null ? (value as JsonRecord) : {};

function priceValidation(value: unknown): PriceValidation | undefined {
  const data = record(value);
  if (typeof data.allPassed !== "boolean") return undefined;
  const rawChecks = Array.isArray(data.checks) ? data.checks : [];
  return {
    allPassed: data.allPassed,
    quotedUsdcCents: Number(data.quotedUsdcCents ?? 0),
    checks: rawChecks.map((item) => {
      const check = record(item);
      return {
        name: String(check.name ?? "AIMorgan check"),
        passed: check.passed === true,
        reason: String(check.reason ?? "No reason supplied."),
      };
    }),
  };
}

function usdcCents(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\$\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const cents = Math.round(Number(value.slice(1)) * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

function strategyFrom(value: unknown): Strategy {
  const outer = record(value);
  const data = Object.keys(record(outer.strategy)).length ? record(outer.strategy) : outer;
  const declaredFee = usdcCents(record(outer.x402).price);
  const parsedValidation = priceValidation(data.priceValidation ?? outer.priceValidation);
  const validation = parsedValidation && declaredFee != null
    ? { ...parsedValidation, quotedUsdcCents: declaredFee }
    : parsedValidation;
  return {
    id: String(data.id ?? outer.correlation_id ?? crypto.randomUUID()),
    summary: String(data.summary ?? data.rationale ?? "AIMorgan strategy received."),
    idleFundsUsdcCents: Number(data.idleFundsUsdcCents ?? data.idle_funds_usdc_cents ?? 0),
    advisoryVaultIds: Array.isArray(data.vaults)
      ? data.vaults.map((vault) => String(record(vault).id ?? record(vault).vault_id ?? "unknown"))
      : [],
    priceValidation: validation,
  };
}

function settlementFrom(response: Response) {
  const header = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
  if (!header) throw new Error("Paid AIMorgan response did not include an x402 settlement receipt.");
  const settlement = decodePaymentResponseHeader(header) as SettleResponse;
  if (settlement.success !== true) throw new Error(`AIMorgan x402 settlement failed: ${settlement.errorReason ?? "unknown reason"}.`);
  if (settlement.network !== "eip155:8453") throw new Error(`AIMorgan settled on unexpected network ${settlement.network}.`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)) {
    throw new Error("AIMorgan x402 receipt did not contain a Base transaction hash.");
  }
  return {
    transactionHash: settlement.transaction as HexHash,
    network: "eip155:8453" as const,
  };
}

export class AiMorganRestAdapter implements AiMorganPort {
  constructor(private readonly baseUrl = "https://aimorgan.net") {}

  async validatePrice(quote: X402Quote): Promise<PriceValidation> {
    try {
      const response = await fetch(`${this.baseUrl}/api/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "x402_payment",
          resource: quote.resource,
          amount_usdc_cents: quote.amountUsdcCents,
          pay_to: quote.payTo,
          network: quote.network,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = record(await response.json());
      return (
        priceValidation(body.priceValidation) ?? {
          allPassed: false,
          quotedUsdcCents: quote.amountUsdcCents,
          checks: [{ name: "AIMorgan response", passed: false, reason: "priceValidation was absent." }],
        }
      );
    } catch (error) {
      return {
        allPassed: false,
        quotedUsdcCents: quote.amountUsdcCents,
        checks: [{
          name: "AIMorgan availability",
          passed: false,
          reason: error instanceof Error ? error.message : "AIMorgan unavailable.",
        }],
      };
    }
  }

  async strategize(input: {
    agentAddress: HexAddress;
    totalUsdcCents: number;
    dry: boolean;
    payment?: SignedPayment;
    feeWaived?: boolean;
  }): Promise<Strategy> {
    if (input.payment && input.feeWaived) throw new Error("AIMorgan request cannot be both x402-paid and fee-waived.");
    const endpoint = input.feeWaived ? `${this.baseUrl}/api/strategize?free=true` : `${this.baseUrl}/api/strategize`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.payment ? { "PAYMENT-SIGNATURE": input.payment.signature } : {}),
      },
      body: JSON.stringify({
        agent_address: input.agentAddress,
        total_usdc: (input.totalUsdcCents / 100).toFixed(2),
        risk_profile: "conservative",
        deterministic: true,
        dry: input.dry,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 500);
      throw new Error(`AIMorgan strategize failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
    }
    const strategy = strategyFrom(await response.json());
    if (input.payment) return { ...strategy, aimorganFeeMode: "x402", x402Settlement: settlementFrom(response) };
    return input.feeWaived ? { ...strategy, aimorganFeeMode: "waived" } : strategy;
  }
}
