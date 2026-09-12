import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { IdempotencyError } from "./errors";
import type { GatewayStore } from "./ports";
import type {
  Agent,
  Mandate,
  MandateCommitmentOpening,
  StatementEvent,
  StoredIdempotency,
  Strategy,
} from "./types";

interface StoreState {
  agents: Record<string, Agent>;
  mandates: Record<string, Mandate>;
  mandateOpenings: Record<string, MandateCommitmentOpening>;
  events: StatementEvent[];
  strategies: Record<string, Strategy>;
  idempotency: Record<string, StoredIdempotency>;
}

const emptyState = (): StoreState => ({
  agents: {},
  mandates: {},
  mandateOpenings: {},
  events: [],
  strategies: {},
  idempotency: {},
});

export class FileGatewayStore implements GatewayStore {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async locked<T>(work: () => Promise<T>): Promise<T> {
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

  private async read(): Promise<StoreState> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<StoreState>;
      return {
        ...emptyState(),
        ...parsed,
        mandateOpenings: parsed.mandateOpenings ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
  }

  private async write(state: StoreState): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }

  private async mutate<T>(work: (state: StoreState) => T): Promise<T> {
    return this.locked(async () => {
      const state = await this.read();
      const result = work(state);
      await this.write(state);
      return structuredClone(result);
    });
  }

  private async inspect<T>(work: (state: StoreState) => T): Promise<T> {
    return this.locked(async () => structuredClone(work(await this.read())));
  }

  async putAgent(agent: Agent): Promise<void> {
    await this.mutate((state) => { state.agents[agent.id] = agent; });
  }

  async getAgent(agentId: string): Promise<Agent | undefined> {
    return this.inspect((state) => state.agents[agentId]);
  }

  async putMandate(mandate: Mandate): Promise<void> {
    await this.mutate((state) => { state.mandates[mandate.agentId] = mandate; });
  }

  async getMandate(agentId: string): Promise<Mandate | undefined> {
    return this.inspect((state) => state.mandates[agentId]);
  }

  async putMandateOpening(opening: MandateCommitmentOpening): Promise<void> {
    await this.mutate((state) => { state.mandateOpenings[opening.mandateId] = opening; });
  }

  async getMandateOpening(mandateId: string): Promise<MandateCommitmentOpening | undefined> {
    return this.inspect((state) => state.mandateOpenings[mandateId]);
  }

  async updateMandate(agentId: string, update: (mandate: Mandate) => Mandate): Promise<Mandate | undefined> {
    return this.mutate((state) => {
      const mandate = state.mandates[agentId];
      if (!mandate) return undefined;
      const next = update(structuredClone(mandate));
      state.mandates[agentId] = next;
      return next;
    });
  }

  async appendEvent(event: StatementEvent): Promise<void> {
    await this.mutate((state) => {
      if (state.events.some((existing) => existing.id === event.id || (
        event.action === "earn.sweep" && event.status === "completed" && event.reference
        && existing.agentId === event.agentId && existing.action === event.action
        && existing.status === event.status && existing.reference === event.reference
      ))) return;
      state.events.push(event);
    });
  }

  async listEvents(agentId: string): Promise<StatementEvent[]> {
    return this.inspect((state) => state.events.filter((event) => event.agentId === agentId));
  }

  async putStrategy(agentId: string, strategy: Strategy): Promise<void> {
    await this.mutate((state) => { state.strategies[`${agentId}:${strategy.id}`] = strategy; });
  }

  async getStrategy(agentId: string, strategyId: string): Promise<Strategy | undefined> {
    return this.inspect((state) => state.strategies[`${agentId}:${strategyId}`]);
  }

  async claimIdempotency(compoundKey: string, fingerprint: string) {
    return this.mutate((state) => {
      const existing = state.idempotency[compoundKey];
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new IdempotencyError("Idempotency key was already used for a different request.");
        }
        return { record: existing, fresh: false };
      }
      const record: StoredIdempotency = { compoundKey, fingerprint, state: "started" };
      state.idempotency[compoundKey] = record;
      return { record, fresh: true };
    });
  }

  async finishIdempotency(compoundKey: string, result: unknown): Promise<void> {
    await this.mutate((state) => {
      const record = state.idempotency[compoundKey];
      if (record) state.idempotency[compoundKey] = { ...record, state: "succeeded", result };
    });
  }

  async failIdempotency(compoundKey: string, error: string): Promise<void> {
    await this.mutate((state) => {
      const record = state.idempotency[compoundKey];
      if (record) state.idempotency[compoundKey] = { ...record, state: "failed", error };
    });
  }
}
