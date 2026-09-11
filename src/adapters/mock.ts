import { createHash, randomUUID } from "node:crypto";
import type {
  AiMorganPort,
  ArkivPort,
  EnsPort,
  PreflightPort,
  StatementStoragePort,
  WalletPort,
  X402Port,
} from "@/core/ports";
import type { HexAddress, Mandate, PriceValidation, SignedPayment, Strategy, X402Quote } from "@/core/types";

const addressFrom = (value: string): HexAddress =>
  `0x${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;

export class MockWallet implements WalletPort {
  readonly calls: string[] = [];

  async createWallet() {
    const walletId = `wallet_${randomUUID().slice(0, 8)}`;
    this.calls.push("createWallet");
    return { walletId, address: addressFrom(walletId) };
  }

  async signX402(walletId: string, quote: X402Quote): Promise<SignedPayment> {
    this.calls.push(`signX402:${walletId}`);
    return { quote, signature: `mock_sig_${quote.nonce}` };
  }

  async depositEarn(input: { walletId: string; vaultId: string; amountUsdcCents: number; idempotencyKey: string }) {
    this.calls.push(`depositEarn:${input.vaultId}`);
    return { actionId: `earn_${randomUUID().slice(0, 8)}`, status: "succeeded" };
  }
}

export class MockEns implements EnsPort {
  async createIdentity(label: string) {
    return { name: `${label}.agents.unflat.eth`, reference: `ensv2:sepolia:${label}` };
  }
}

export class MockArkiv implements ArkivPort {
  async publishMandate(mandate: Mandate) {
    return { entityKey: `arkiv:tiramisu:${mandate.id}` };
  }
}

export class MockX402 implements X402Port {
  async quote(
    resource: string,
    request: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
  ): Promise<X402Quote> {
    return {
      resource,
      payTo: addressFrom(resource),
      network: "eip155:8453",
      amountUsdcCents: resource.includes("aimorgan.net") ? 5 : 1,
      nonce: randomUUID(),
      method: request.method,
      body: request.body,
    };
  }

  async submit() {
    return { settlementId: `x402_${randomUUID().slice(0, 8)}` };
  }
}

export class MockAiMorgan implements AiMorganPort {
  readonly strategizeCalls: boolean[] = [];
  validationPasses = true;

  async validatePrice(quote: X402Quote): Promise<PriceValidation> {
    return {
      allPassed: this.validationPasses,
      quotedUsdcCents: quote.amountUsdcCents,
      checks: [{ name: "quoted-price", passed: this.validationPasses, reason: "Mock price is within policy." }],
    };
  }

  async strategize(input: { totalUsdcCents: number; dry: boolean }): Promise<Strategy> {
    this.strategizeCalls.push(input.dry);
    return {
      id: `${input.dry ? "dry" : "paid"}_${randomUUID().slice(0, 8)}`,
      summary: input.dry ? "Dry preflight recommends sweeping idle USDC." : "Paid strategy confirmed.",
      idleFundsUsdcCents: Math.min(900, input.totalUsdcCents),
      advisoryVaultIds: ["aimorgan-untrusted-vault"],
      priceValidation: {
        allPassed: this.validationPasses,
        quotedUsdcCents: 5,
        checks: [{ name: "price", passed: this.validationPasses, reason: "Mock AIMorgan validation." }],
      },
    };
  }
}

export class MockPreflight implements PreflightPort {
  passes = true;

  async verifyEarn() {
    return {
      allPassed: this.passes,
      reason: this.passes ? "eth_estimateGas and USDC allowance checks passed." : "Allowance is insufficient.",
      gasEstimate: "118204",
      allowanceOk: this.passes,
    };
  }
}

export class MockStatementStorage implements StatementStoragePort {
  lastCiphertext?: Uint8Array;

  async upload(ciphertext: Uint8Array) {
    this.lastCiphertext = ciphertext;
    const reference = createHash("sha256").update(ciphertext).digest("hex");
    return { reference: `swarm:${reference}` };
  }
}
