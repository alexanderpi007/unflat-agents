import { randomUUID } from "node:crypto";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import type { X402Port } from "@/core/ports";
import type { HexAddress, SignedPayment } from "@/core/types";

function atomicToCents(value: string): number {
  const atomic = BigInt(value);
  return Number((atomic + 9_999n) / 10_000n);
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

    return {
      resource,
      payTo: accepted.payTo as HexAddress,
      network: "eip155:8453" as const,
      amountUsdcCents: atomicToCents(amountOf(accepted)),
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
    return {
      settlementId:
        response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("x-request-id") ?? randomUUID(),
    };
  }
}
