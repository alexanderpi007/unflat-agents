import type { GatewayStore } from "./ports";
import type {
  Agent,
  Mandate,
  MandateRequest,
  MandateCommitmentOpening,
  StatementEvent,
  StoredIdempotency,
  Strategy,
} from "./types";
import { IdempotencyError } from "./errors";

export class MemoryGatewayStore implements GatewayStore {
  private readonly approvals: MandateRequest[] = [];
  async requestApproval(request: MandateRequest) {
    return this.locked(() => {
      const existing = this.approvals.find(r => r.principal === request.principal && ["pending", "approving"].includes(r.status));
      if (existing) return structuredClone(existing);
      this.approvals.push(structuredClone(request));
      return request;
    });
  }
  async listApprovals() { return structuredClone(this.approvals); }
  async transitionApproval(id: string, from: MandateRequest["status"], to: MandateRequest["status"], mandateId?: string) {
    return this.locked(() => {
      const request = this.approvals.find(r => r.id === id && r.status === from);
      if (!request) return false;
      request.status = to;
      if (mandateId) request.mandateId = mandateId;
      return true;
    });
  }
  private readonly agents = new Map<string, Agent>();
  private readonly mandates = new Map<string, Mandate>();
  private readonly mandateOpenings = new Map<string, MandateCommitmentOpening>();
  private readonly events: StatementEvent[] = [];
  private readonly idempotency = new Map<string, StoredIdempotency>();
  private readonly strategies = new Map<string, Strategy>();
  private tail: Promise<void> = Promise.resolve();

  private async locked<T>(work: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = () => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async putAgent(agent: Agent): Promise<void> {
    await this.locked(() => this.agents.set(agent.id, structuredClone(agent)));
  }

  async getAgent(agentId: string): Promise<Agent | undefined> {
    const agent = this.agents.get(agentId);
    return agent ? structuredClone(agent) : undefined;
  }

  async putMandate(mandate: Mandate): Promise<void> {
    await this.locked(() => this.mandates.set(mandate.agentId, structuredClone(mandate)));
  }

  async getMandate(agentId: string): Promise<Mandate | undefined> {
    const mandate = this.mandates.get(agentId);
    return mandate ? structuredClone(mandate) : undefined;
  }

  async putMandateOpening(opening: MandateCommitmentOpening): Promise<void> {
    await this.locked(() => this.mandateOpenings.set(opening.mandateId, structuredClone(opening)));
  }

  async getMandateOpening(mandateId: string): Promise<MandateCommitmentOpening | undefined> {
    const opening = this.mandateOpenings.get(mandateId);
    return opening ? structuredClone(opening) : undefined;
  }

  async updateMandate(agentId: string, update: (mandate: Mandate) => Mandate): Promise<Mandate | undefined> {
    return this.locked(() => {
      const current = this.mandates.get(agentId);
      if (!current) return undefined;
      const next = update(structuredClone(current));
      this.mandates.set(agentId, structuredClone(next));
      return structuredClone(next);
    });
  }

  async appendEvent(event: StatementEvent): Promise<void> {
    await this.locked(() => {
      if (this.events.some((existing) => existing.id === event.id || (
        event.action === "earn.sweep" && event.status === "completed" && event.reference
        && existing.agentId === event.agentId && existing.action === event.action
        && existing.status === event.status && existing.reference === event.reference
      ))) return;
      this.events.push(structuredClone(event));
    });
  }

  async listEvents(agentId: string): Promise<StatementEvent[]> {
    return this.events.filter((event) => event.agentId === agentId).map((event) => structuredClone(event));
  }

  async putStrategy(agentId: string, strategy: Strategy): Promise<void> {
    await this.locked(() => this.strategies.set(`${agentId}:${strategy.id}`, structuredClone(strategy)));
  }

  async getStrategy(agentId: string, strategyId: string): Promise<Strategy | undefined> {
    const strategy = this.strategies.get(`${agentId}:${strategyId}`);
    return strategy ? structuredClone(strategy) : undefined;
  }

  async claimIdempotency(
    compoundKey: string,
    fingerprint: string,
  ): Promise<{ record: StoredIdempotency; fresh: boolean }> {
    return this.locked(() => {
      const existing = this.idempotency.get(compoundKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new IdempotencyError("Idempotency key was already used for a different request.");
        }
        return { record: structuredClone(existing), fresh: false };
      }
      const claimed: StoredIdempotency = { compoundKey, fingerprint, state: "started" };
      this.idempotency.set(compoundKey, claimed);
      return { record: structuredClone(claimed), fresh: true };
    });
  }

  async finishIdempotency(compoundKey: string, result: unknown): Promise<void> {
    await this.locked(() => {
      const record = this.idempotency.get(compoundKey);
      if (record) this.idempotency.set(compoundKey, { ...record, state: "succeeded", result });
    });
  }

  async failIdempotency(compoundKey: string, error: string): Promise<void> {
    await this.locked(() => {
      const record = this.idempotency.get(compoundKey);
      if (record) this.idempotency.set(compoundKey, { ...record, state: "failed", error });
    });
  }
}
