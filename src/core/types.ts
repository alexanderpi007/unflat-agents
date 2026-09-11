export type ActionKind = "x402.pay" | "aimorgan.strategize" | "earn.sweep";

export type HexAddress = `0x${string}`;

export interface Agent {
  id: string;
  displayName: string;
  ensName: string;
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
  arkivEntityKey?: string;
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
}

export interface X402Quote {
  resource: string;
  payTo: HexAddress;
  network: "eip155:8453";
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
  statementReference: string;
  ownerStatementKey: string;
}
