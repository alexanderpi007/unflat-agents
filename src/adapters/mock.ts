import { createHash, randomUUID } from "node:crypto";
import { chainConfig } from "@/core/chains";
import type {
  AiMorganPort,
  ArkivPort,
  Clock,
  EnsPort,
  PreflightPort,
  StatementStoragePort,
  VaultRatePort,
  WalletPort,
  X402Port,
} from "@/core/ports";
import type {
  HexAddress,
  HexHash,
  ArkivMandateEntity,
  ArkivMandatePublication,
  PriceValidation,
  SignedPayment,
  Strategy,
  UsdcTransferResult,
  X402Quote,
} from "@/core/types";

const baseUsdc: HexAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const addressFrom = (value: string): HexAddress =>
  `0x${createHash("sha256").update(value).digest("hex").slice(0, 40)}`;

export class MockWallet implements WalletPort {
  readonly calls: string[] = [];

  constructor(private readonly seededWallet?: { walletId: string; address: HexAddress }) {}

  async createWallet() {
    const walletId = this.seededWallet?.walletId ?? `wallet_${randomUUID().slice(0, 8)}`;
    this.calls.push("createWallet");
    return { walletId, address: this.seededWallet?.address ?? addressFrom(walletId) };
  }

  async createOwnerWallet(input: Parameters<WalletPort["createOwnerWallet"]>[0]) {
    this.calls.push("createOwnerWallet");
    const walletId = `owner_wallet_${input.accountId}`;
    return { walletId, address: addressFrom(walletId), ownership: { kind: "privy-user" as const,
      ownerEmail: input.ownerEmail, privyUserId: `did:privy:mock-${addressFrom(input.ownerEmail)}`,
      signerId: "mock-session-signer", policyId: `mock-owner-policy-${input.accountId}` } };
  }

  async redeemDirectVault(input: Parameters<WalletPort["redeemDirectVault"]>[0]) {
    this.calls.push(`redeemDirectVault:${input.vaultAddress}:${input.sharesRaw}`);
    return { transactionHash: `0x${"6".repeat(64)}` as HexHash, assetsReceivedRaw: "1000000", sharesRedeemedRaw: input.sharesRaw };
  }

  async verifyPrivyEarnVault() {
    this.calls.push("verifyPrivyEarnVault");
  }

  async signX402(walletId: string, quote: X402Quote): Promise<SignedPayment> {
    this.calls.push(`signX402:${walletId}`);
    return { quote, signature: `mock_sig_${quote.nonce}` };
  }

  async transferUsdc(input: Parameters<WalletPort["transferUsdc"]>[0]): Promise<UsdcTransferResult> {
    this.calls.push(`transferUsdc:${input.recipient}:${input.amountUsdcCents}`);
    return {
      transactionHash: `0x${"3".repeat(64)}` as HexHash,
      network: chainConfig(input.chain).network,
      source: "mock" as const,
    };
  }

  async depositEarn(input: { walletId: string; vaultId: string; amountUsdcCents: number; idempotencyKey: string }) {
    this.calls.push(`depositEarn:${input.vaultId}`);
    return {
      mode: "privy-earn" as const,
      actionId: `earn_${randomUUID().slice(0, 8)}`,
      status: "succeeded" as const,
      transactionHashes: [`0x${"2".repeat(64)}` as HexHash],
    };
  }

  async approveUsdc(input: { spender: HexAddress; amountUsdcCents: number }) {
    this.calls.push(`approveUsdc:${input.spender}:${input.amountUsdcCents}`);
    const transactionHash = `0x${"4".repeat(64)}` as HexHash;
    return { transactionHash, explorerUrl: `https://basescan.org/tx/${transactionHash}` };
  }

  async depositDirectVault(input: { vaultAddress: HexAddress; amountUsdcCents: number }) {
    this.calls.push(`depositDirectVault:${input.vaultAddress}:${input.amountUsdcCents}`);
    const transactionHash = `0x${"2".repeat(64)}` as HexHash;
    return {
      transactionHash,
      explorerUrl: `https://basescan.org/tx/${transactionHash}`,
      sharesReceived: "1",
      sharesReceivedRaw: "1000000000000000000",
      shareDecimals: 18,
    };
  }
}

export class MockVaultRate implements VaultRatePort {
  async getRate() {
    return {
      apyBasisPoints: null,
      provider: "Morpho",
      source: "mock-unavailable" as const,
      detail: "MOCK — live Morpho API APY unavailable; no fallback percentage is substituted.",
      asOf: new Date().toISOString(),
    };
  }
}

export class MockEns implements EnsPort {
  private readonly addresses = new Map<string, HexAddress>();
  async createIdentity(label: string, address: HexAddress) {
    this.addresses.set(`${label}.agents.unflat.eth`, address);
    return { name: `${label}.agents.unflat.eth`, reference: `ensv2:sepolia:${label}` };
  }
  async resolveIdentity(name: string) {
    return { address: this.addresses.get(name) ?? null, explorerUrl: "", mode: "mock" as const };
  }
  async setMandateCommitment() { return {}; }
}

export class MockArkiv implements ArkivPort {
  private readonly entities = new Map<string, ArkivMandateEntity>();

  constructor(private readonly clock: Clock = { now: () => new Date() }) {}

  async publishMandate(input: ArkivMandatePublication) {
    const entityKey = `0x${createHash("sha256").update(`${input.agentId}:${input.commitment}`).digest("hex")}` as HexHash;
    const transactionHash = `0x${createHash("sha256").update(`tx:${entityKey}`).digest("hex")}` as HexHash;
    const entity: ArkivMandateEntity = {
      entityKey,
      transactionHash,
      explorerUrl: `https://tiramisu.explorer.arkiv.network/entity/${entityKey}`,
      transactionExplorerUrl: `https://tiramisu.explorer.arkiv.network/tx/${transactionHash}`,
      agentId: input.agentId,
      expiry: input.expiry,
      commitment: input.commitment,
      expiresAtBlock: String(Math.ceil(new Date(input.expiry).getTime() / 2_000)),
    };
    this.entities.set(entityKey, entity);
    return structuredClone(entity);
  }

  async findValidMandates(agentId: string) {
    const now = this.clock.now().getTime();
    const entities = [...this.entities.values()]
      .filter((entity) => entity.agentId === agentId && now < new Date(entity.expiry).getTime())
      .map((entity) => structuredClone(entity));
    return {
      agentId,
      found: entities.length > 0,
      blockNumber: String(Math.floor(now / 2_000)),
      query: `agent_id = str('${agentId}') AND $expiresAt > current_block AND $creator = mock`,
      entities,
    };
  }
}

export class MockX402 implements X402Port {
  readonly calls: string[] = [];

  async quote(
    resource: string,
    request: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
  ): Promise<X402Quote> {
    this.calls.push(`quote:${resource}`);
    return {
      resource,
      payTo: addressFrom(resource),
      asset: baseUsdc,
      network: "eip155:8453",
      amountAtomic: resource.includes("aimorgan.net") ? "50000" : "10000",
      amountUsdcCents: resource.includes("aimorgan.net") ? 5 : 1,
      nonce: randomUUID(),
      method: request.method,
      body: request.body,
    };
  }

  async submit() {
    this.calls.push("submit");
    return {
      transactionHash: `0x${"1".repeat(64)}` as HexHash,
      network: "eip155:8453" as const,
    };
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

  async strategize(input: { totalUsdcCents: number; dry: boolean; feeWaived?: boolean }): Promise<Strategy> {
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
      ...(!input.dry && !input.feeWaived ? {
        x402Settlement: {
          transactionHash: `0x${"1".repeat(64)}` as HexHash,
          network: "eip155:8453" as const,
        },
        aimorganFeeMode: "x402" as const,
      } : {}),
      ...(!input.dry && input.feeWaived ? { aimorganFeeMode: "waived" as const } : {}),
    };
  }
}

export class MockPreflight implements PreflightPort {
  async verifyRecall() { return { allPassed: true, reason: "Mock canonical USDC vault, shares and redeem simulation passed.", assetsRaw: "1000000" }; }
  passes = true;
  readonly calls: string[] = [];

  async getUsdcBalance() {
    return { rawAmount: "1000000000", amountUsdcCents: 100_000 };
  }

  async verifyUsdcTransfer() {
    return {
      allPassed: this.passes,
      reason: this.passes ? "Base USDC balance and eth_estimateGas checks passed." : "Transfer preflight failed.",
      gasEstimate: this.passes ? "65000" : "0",
    };
  }

  async verifyEarn(input: Parameters<PreflightPort["verifyEarn"]>[0]) {
    this.calls.push(`verifyEarn:${input.execution}`);
    return {
      allPassed: this.passes,
      reason: this.passes
        ? "Allowlisted mock vault uses canonical Base USDC and the mock wallet balance covers the deposit."
        : "Mock vault asset or wallet balance check failed.",
      assetAddress: baseUsdc,
      balanceRawAmount: this.passes ? "1000000000" : "0",
      allowanceRawAmount: "0",
      execution: input.execution,
    };
  }

  async simulateDirectDeposit(_input: Parameters<PreflightPort["simulateDirectDeposit"]>[0]) {
    this.calls.push("simulateDirectDeposit");
    return {
      allPassed: this.passes,
      reason: this.passes
        ? "MOCK ERC-4626 deposit eth_call simulation succeeded."
        : "MOCK ERC-4626 deposit eth_call simulation failed.",
      ...(this.passes ? { simulatedSharesRaw: "1000000000000000000" } : {}),
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
