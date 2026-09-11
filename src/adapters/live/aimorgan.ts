import type { AiMorganPort } from "@/core/ports";
import type { HexAddress, PriceValidation, SignedPayment, Strategy, X402Quote } from "@/core/types";

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

function strategyFrom(value: unknown): Strategy {
  const outer = record(value);
  const data = Object.keys(record(outer.strategy)).length ? record(outer.strategy) : outer;
  const validation = priceValidation(data.priceValidation ?? outer.priceValidation);
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
  }): Promise<Strategy> {
    const response = await fetch(`${this.baseUrl}/api/strategize`, {
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
    if (!response.ok) throw new Error(`AIMorgan strategize failed with HTTP ${response.status}.`);
    return strategyFrom(await response.json());
  }
}

