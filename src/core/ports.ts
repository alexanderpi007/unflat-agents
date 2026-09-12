import type {
  Agent,
  AgentAccount,
  ArkivMandateEntity,
  ArkivMandatePublication,
  ArkivMandateQuery,
  DirectVaultDepositResult,
  DirectVaultTransaction,
  HexAddress,
  Mandate,
  MandateRequest,
  MandateCommitmentOpening,
  PriceValidation,
  EarnDepositResult,
  EarnVaultRate,
  SignedPayment,
  StatementEvent,
  StoredIdempotency,
  Strategy,
  UsdcBalance,
  UsdcTransferResult,
  VaultConfig,
  X402Quote,
  X402Settlement,
} from "./types";

export interface Clock {
  now(): Date;
}

export interface GatewayStore {
  ensureOwnerId(): Promise<string>;
  reserveAccount(account: AgentAccount): Promise<boolean>;
  getAccount(accountId: string): Promise<AgentAccount | undefined>;
  listAccounts(): Promise<AgentAccount[]>;
  findAccountByTokenHash(tokenHash: string): Promise<AgentAccount | undefined>;
  finishAccount(accountId: string, status: "ready" | "failed"): Promise<void>;
  listAgents(): Promise<Agent[]>;
  requestApproval(request: MandateRequest): Promise<MandateRequest>;
  listApprovals(): Promise<MandateRequest[]>;
  transitionApproval(id: string, from: MandateRequest["status"], to: MandateRequest["status"], mandateId?: string): Promise<boolean>;
  putAgent(agent: Agent): Promise<void>;
  getAgent(agentId: string): Promise<Agent | undefined>;
  putMandate(mandate: Mandate): Promise<void>;
  getMandate(agentId: string): Promise<Mandate | undefined>;
  putMandateOpening(opening: MandateCommitmentOpening): Promise<void>;
  getMandateOpening(mandateId: string): Promise<MandateCommitmentOpening | undefined>;
  updateMandate(agentId: string, update: (mandate: Mandate) => Mandate): Promise<Mandate | undefined>;
  appendEvent(event: StatementEvent): Promise<void>;
  listEvents(agentId: string): Promise<StatementEvent[]>;
  putStrategy(agentId: string, strategy: Strategy): Promise<void>;
  getStrategy(agentId: string, strategyId: string): Promise<Strategy | undefined>;
  claimIdempotency(
    compoundKey: string,
    fingerprint: string,
  ): Promise<{ record: StoredIdempotency; fresh: boolean }>;
  finishIdempotency(compoundKey: string, result: unknown): Promise<void>;
  failIdempotency(compoundKey: string, error: string): Promise<void>;
}

export interface WalletPort {
  createWallet(): Promise<{ walletId: string; address: HexAddress }>;
  verifyPrivyEarnVault(vault: VaultConfig): Promise<void>;
  signX402(walletId: string, quote: X402Quote): Promise<SignedPayment>;
  transferUsdc(input: {
    walletId: string;
    recipient: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }): Promise<UsdcTransferResult>;
  depositEarn(input: {
    walletId: string;
    vaultId: string;
    vaultAddress: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }): Promise<EarnDepositResult>;
  approveUsdc(input: {
    walletId: string;
    walletAddress: HexAddress;
    spender: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }): Promise<DirectVaultTransaction>;
  depositDirectVault(input: {
    walletId: string;
    walletAddress: HexAddress;
    vaultAddress: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }): Promise<DirectVaultDepositResult>;
}

export interface VaultRatePort {
  getRate(vault: VaultConfig): Promise<EarnVaultRate>;
}

export interface EnsPort {
  createIdentity(label: string, owner: HexAddress, ownerId?: string): Promise<{ name: string; reference: string }>;
  resolveIdentity(name: string): Promise<{ address: HexAddress | null; explorerUrl: string; mode: "live" | "mock" }>;
  setMandateCommitment(name: string, commitment: HexAddress, ownerId: string): Promise<{ reference?: string; detail?: string }>;
}

export interface ArkivPort {
  publishMandate(mandate: ArkivMandatePublication): Promise<ArkivMandateEntity>;
  findValidMandates(agentId: string): Promise<ArkivMandateQuery>;
}

export interface X402Port {
  quote(resource: string, request?: { method: "GET" | "POST"; body?: unknown }): Promise<X402Quote>;
  submit(payment: SignedPayment): Promise<X402Settlement>;
}

export interface AiMorganPort {
  validatePrice(quote: X402Quote): Promise<PriceValidation>;
  strategize(input: {
    agentAddress: HexAddress;
    totalUsdcCents: number;
    dry: boolean;
    payment?: SignedPayment;
    feeWaived?: boolean;
  }): Promise<Strategy>;
}

export interface PreflightPort {
  getUsdcBalance(walletAddress: HexAddress): Promise<UsdcBalance>;
  verifyUsdcTransfer(input: {
    walletAddress: HexAddress;
    recipient: HexAddress;
    amountUsdcCents: number;
  }): Promise<{ allPassed: boolean; reason: string; gasEstimate: string }>;
  verifyEarn(input: {
    walletAddress: HexAddress;
    vaultAddress: HexAddress;
    amountUsdcCents: number;
    execution: "privy-earn-api" | "direct-morpho";
  }): Promise<{
    allPassed: boolean;
    reason: string;
    assetAddress?: HexAddress;
    balanceRawAmount?: string;
    allowanceRawAmount?: string;
    approvalTransactionHash?: `0x${string}`;
    execution: "privy-earn-api" | "direct-morpho";
  }>;
  simulateDirectDeposit(input: {
    walletAddress: HexAddress;
    vaultAddress: HexAddress;
    amountUsdcCents: number;
    approvalTransactionHash?: `0x${string}`;
  }): Promise<{
    allPassed: boolean;
    reason: string;
    simulatedSharesRaw?: string;
  }>;
}

export interface StatementStoragePort {
  upload(ciphertext: Uint8Array): Promise<{ reference: string }>;
}

export interface Dependencies {
  store: GatewayStore;
  clock: Clock;
  wallet: WalletPort;
  ens: EnsPort;
  arkiv: ArkivPort;
  x402: X402Port;
  aiMorgan: AiMorganPort;
  preflight: PreflightPort;
  vaultRate: VaultRatePort;
  statementStorage: StatementStoragePort;
  vaultAllowlist: VaultConfig[];
  earnViaPrivy: boolean;
  aiMorganX402: boolean;
  demoPaymentRecipient?: HexAddress;
}
