import type {
  Agent,
  HexAddress,
  Mandate,
  PriceValidation,
  SignedPayment,
  StatementEvent,
  StoredIdempotency,
  Strategy,
  X402Quote,
} from "./types";

export interface Clock {
  now(): Date;
}

export interface GatewayStore {
  putAgent(agent: Agent): Promise<void>;
  getAgent(agentId: string): Promise<Agent | undefined>;
  putMandate(mandate: Mandate): Promise<void>;
  getMandate(agentId: string): Promise<Mandate | undefined>;
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
  signX402(walletId: string, quote: X402Quote): Promise<SignedPayment>;
  depositEarn(input: {
    walletId: string;
    vaultId: string;
    amountUsdcCents: number;
    idempotencyKey: string;
  }): Promise<{ actionId: string; status: string }>;
}

export interface EnsPort {
  createIdentity(label: string, owner: HexAddress): Promise<{ name: string; reference: string }>;
}

export interface ArkivPort {
  publishMandate(mandate: Mandate): Promise<{ entityKey: string }>;
}

export interface X402Port {
  quote(resource: string, request?: { method: "GET" | "POST"; body?: unknown }): Promise<X402Quote>;
  submit(payment: SignedPayment): Promise<{ settlementId: string }>;
}

export interface AiMorganPort {
  validatePrice(quote: X402Quote): Promise<PriceValidation>;
  strategize(input: {
    agentAddress: HexAddress;
    totalUsdcCents: number;
    dry: boolean;
    payment?: SignedPayment;
  }): Promise<Strategy>;
}

export interface PreflightPort {
  verifyEarn(input: {
    walletAddress: HexAddress;
    vaultAddress: HexAddress;
    amountUsdcCents: number;
  }): Promise<{ allPassed: boolean; reason: string; gasEstimate: string; allowanceOk: boolean }>;
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
  statementStorage: StatementStoragePort;
  vaultAllowlist: Array<{ id: string; address: HexAddress; label: string }>;
}
