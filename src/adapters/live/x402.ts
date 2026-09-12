import { randomUUID } from "node:crypto";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { isAddress } from "viem";
import type { X402Port } from "@/core/ports";
import type { HexAddress, HexHash, SignedPayment } from "@/core/types";

const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function atomicToCents(value: string): number {
  const atomic = BigInt(value);
  if (atomic <= 0n || atomic % 10_000n !== 0n) {
    throw new Error("x402 USDC amount must be positive and use exact cent precision.");
  }
  const cents = Number(atomic / 10_000n);
  if (!Number.isSafeInteger(cents)) throw new Error("x402 USDC amount exceeds the safe mandate range.");
  return cents;
}

function amountOf(requirement: PaymentRequirements): string {
  const raw = requirement as unknown as { amount?: string; maxAmountRequired?: string };
  const amount = raw.amount ?? raw.maxAmountRequired;
  if (!amount) throw new Error("x402 payment requirement did not include an amount.");
  return amount;
}

export class HttpX402Adapter implements X402Port {
  async quote(resource: string, request = { method: "GET" as const, body: undefined as unknown }) {
    const response = await fetch(resource, {
      method: request.method,
      headers: request.body ? { "content-type": "application/json" } : undefined,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status !== 402) throw new Error(`Expected x402 quote, received HTTP ${response.status}.`);

    const header = response.headers.get("PAYMENT-REQUIRED");
    let paymentRequired: PaymentRequired;
    if (header) {
      paymentRequired = decodePaymentRequiredHeader(header);
    } else {
      paymentRequired = (await response.json()) as PaymentRequired;
    }
    const accepted = paymentRequired.accepts.find((option) => String(option.network) === "eip155:8453");
    if (!accepted) throw new Error("Resource did not offer an x402 Base mainnet payment option.");
    if (accepted.scheme !== "exact") throw new Error("Only the exact x402 payment scheme is supported.");
    if (String(accepted.asset).toLowerCase() !== baseUsdc.toLowerCase()) {
      throw new Error("Only canonical Base USDC is accepted for x402 payments.");
    }
    if (!isAddress(accepted.payTo)) throw new Error("x402 payment recipient is not a valid EVM address.");
    const amountAtomic = amountOf(accepted);

    return {
      resource,
      payTo: accepted.payTo as HexAddress,
      asset: accepted.asset as HexAddress,
      network: "eip155:8453" as const,
      amountAtomic,
      amountUsdcCents: atomicToCents(amountAtomic),
      nonce: randomUUID(),
      method: request.method,
      body: request.body,
      paymentRequired,
    };
  }

  async submit(payment: SignedPayment) {
    const response = await fetch(payment.quote.resource, {
      method: payment.quote.method ?? "GET",
      headers: {
        "PAYMENT-SIGNATURE": payment.signature,
        ...(payment.quote.body ? { "content-type": "application/json" } : {}),
      },
      body: payment.quote.body ? JSON.stringify(payment.quote.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Paid x402 request failed with HTTP ${response.status}.`);
    const header = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
    if (!header) throw new Error("Paid x402 response did not include a settlement receipt.");
    const settlement = decodePaymentResponseHeader(header) as SettleResponse;
    if (settlement.success !== true) throw new Error(`x402 settlement failed: ${settlement.errorReason ?? "unknown reason"}.`);
    if (settlement.network !== "eip155:8453") throw new Error(`x402 settled on unexpected network ${settlement.network}.`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)) {
      throw new Error("x402 settlement receipt did not contain a Base transaction hash.");
    }
    return {
      transactionHash: settlement.transaction as HexHash,
      network: "eip155:8453" as const,
    };
  }
}
