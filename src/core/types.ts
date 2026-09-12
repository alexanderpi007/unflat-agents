export type ActionKind = "usdc.transfer" | "x402.pay" | "aimorgan.strategize" | "earn.sweep";

export type HexAddress = `0x${string}`;
export type HexHash = `0x${string}`;

export interface Agent {
  id: string;
  displayName: string;
  ensName: string;
  ensRegistrationTransaction?: string;
  ensResolvedAddress?: HexAddress | null;
  ensExplorerUrl?: string;
  ensMode?: "live" | "mock";
  walletId: string;
  walletAddress: HexAddress;
  createdAt: string;
}

export interface Mandate {
  id: string;
  agentId: string;
  ownerId: string;
  allowedActions: ActionKind[];
  maxPerActionUsdcCents: number;
  maxTotalUsdcCents: number;
  spentUsdcCents: number;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
  arkivEntityKey?: HexHash;
  arkivTransactionHash?: HexHash;
  arkivExplorerUrl?: string;
  arkivExpiresAtBlock?: string;
  arkivCommitment?: HexHash;
}

export interface MandateCommitmentOpening {
  mandateId: string;
  agentId: string;
  maxTotalUsdcCents: number;
  maxPerActionUsdcCents: number;
  secret: HexHash;
  commitment: HexHash;
}

export interface ArkivMandatePublication {
  agentId: string;
  expiry: string;
  commitment: HexHash;
  durationSeconds: number;
}

export interface ArkivMandateEntity {
  entityKey: HexHash;
  transactionHash?: HexHash;
  explorerUrl: string;
  transactionExplorerUrl?: string;
  agentId: string;
  expiry: string;
  commitment: HexHash;
  expiresAtBlock: string;
}

export interface ArkivMandateQuery {
  agentId: string;
  found: boolean;
  blockNumber: string;
  query: string;
  entities: ArkivMandateEntity[];
}

export interface MandateDecision {
  allowed: boolean;
  reason: string;
  checkedAt: string;
  remainingUsdcCents: number;
  expiresAt?: string;
}

export interface PriceValidation {
  allPassed: boolean;
  quotedUsdcCents: number;
  checks: Array<{ name: string; passed: boolean; reason: string }>;
}

export interface Strategy {
  id: string;
  summary: string;
  idleFundsUsdcCents: number;
  advisoryVaultIds: string[];
  priceValidation?: PriceValidation;
  x402Settlement?: X402Settlement;
  aimorganFeeMode?: "x402" | "waived";
}

export interface X402Quote {
  resource: string;
  payTo: HexAddress;
  asset: HexAddress;
  network: "eip155:8453";
  amountAtomic: string;
  amountUsdcCents: number;
  nonce: string;
  method?: "GET" | "POST";
  body?: unknown;
  paymentRequired?: unknown;
}

export interface SignedPayment {
  signature: string;
  quote: X402Quote;
}

export interface X402Settlement {
  transactionHash: HexHash;
  network: "eip155:8453";
}

export type X402QuoteConfirmation = Pick<
  X402Quote,
  "resource" | "payTo" | "asset" | "network" | "amountAtomic" | "amountUsdcCents" | "method"
>;

export interface EarnDepositResult {
  mode: "privy-earn";
  actionId: string;
  status: "succeeded";
  transactionHashes: HexHash[];
}

export interface DirectVaultTransaction {
  transactionHash: HexHash;
  explorerUrl: string;
}

export interface DirectVaultDepositResult {
  transactionHash: HexHash;
  explorerUrl: string;
  sharesReceived: string;
  sharesReceivedRaw: string;
  shareDecimals: number | null;
}

export interface DirectEarnDepositResult {
  mode: "direct-morpho";
  status: "succeeded";
  transactionHashes: HexHash[];
  approval: DirectVaultTransaction;
  deposit: DirectVaultTransaction;
  sharesReceived: string;
  sharesReceivedRaw: string;
  shareDecimals: number | null;
}

export interface UsdcTransferResult {
  transactionHash: HexHash;
  network: "eip155:8453";
  source: "privy-live" | "mock";
  explorerUrl?: string;
}

export interface UsdcBalance {
  rawAmount: string;
  amountUsdcCents: number;
}

export interface EarnVaultRate {
  apyBasisPoints: number | null;
  provider: string;
  source: "morpho-api" | "mock-unavailable";
  detail: string;
  asOf: string;
}

export type EarnExecution = "privy-earn-api" | "direct-morpho";

export interface VaultConfig {
  id: string;
  address: HexAddress;
  label: string;
  execution: EarnExecution;
}

export interface AdapterHealth {
  mode: "live" | "mock" | "browser";
  detail: string;
}

export interface RuntimeHealth {
  globalMockOverride: boolean;
  adapters: {
    privy: AdapterHealth;
    aiMorgan: AdapterHealth;
    arkiv: AdapterHealth;
    swarm: AdapterHealth;
    ens: AdapterHealth;
  };
}

export interface StatementEvent {
  id: string;
  agentId: string;
  action: string;
  status: "accepted" | "refused" | "completed" | "failed";
  amountUsdcCents: number;
  reason: string;
  at: string;
  reference?: string;
}

export interface StoredIdempotency {
  compoundKey: string;
  fingerprint: string;
  state: "started" | "succeeded" | "failed";
  result?: unknown;
  error?: string;
}

export interface DemoSnapshot {
  agent: Agent;
  mandate: Mandate;
  events: StatementEvent[];
  statementReference?: string;
  ownerStatementKey?: string;
}
