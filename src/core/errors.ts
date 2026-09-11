import type { MandateDecision } from "./types";

export class RefusalError extends Error {
  readonly decision: MandateDecision;

  constructor(decision: MandateDecision) {
    super(decision.reason);
    this.name = "RefusalError";
    this.decision = decision;
  }
}

export class IdempotencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyError";
  }
}

