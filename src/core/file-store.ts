import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { IdempotencyError } from "./errors";
import type { GatewayStore } from "./ports";
import type {
  Agent,
  AgentAccount,
  Mandate,
  MandateRequest,
  MandateCommitmentOpening,
  StatementEvent,
  StoredIdempotency,
  Strategy,
} from "./types";

interface StoreState {
  ownerId?: string;
  accounts: Record<string, AgentAccount>;
  approvals: MandateRequest[];
  agents: Record<string, Agent>;
  mandates: Record<string, Mandate>;
  mandateOpenings: Record<string, MandateCommitmentOpening>;
  events: StatementEvent[];
  strategies: Record<string, Strategy>;
  idempotency: Record<string, StoredIdempotency>;
}

const emptyState = (): StoreState => ({
  accounts: {},
  approvals: [],
  agents: {},
  mandates: {},
  mandateOpenings: {},
  events: [],
  strategies: {},
  idempotency: {},
});

// Next routes can instantiate separate stores; serialize all access to the same file.
const shared = globalThis as typeof globalThis & { unflatStoreLocks?: Map<string, Promise<void>> };
const locks = shared.unflatStoreLocks ??= new Map();

export class FileGatewayStore implements GatewayStore {
  async ensureOwnerId() {
    return this.mutate(state => state.ownerId ??= `owner:${randomUUID()}`);
  }
  async reserveAccount(account: AgentAccount) {
    return this.mutate(state => {
      if (account.name === "atlas" || Object.values(state.accounts).some(a => a.name === account.name)
        || Object.values(state.agents).some(a => a.ensName.toLowerCase() === `${account.name}.agents.unflat.eth`)) return false;
      state.accounts[account.id] = account;
      return true;
    });
  }
  async getAccount(id: string) { return this.inspect(state => state.accounts[id]); }
  async listAccounts() { return this.inspect(state => Object.values(state.accounts)); }
  async findAccountByTokenHash(hash: string) {
    return this.inspect(state => Object.values(state.accounts).find(a => a.tokenHash === hash));
  }
  async finishAccount(id: string, status: "ready" | "failed") {
    await this.mutate(state => { if (state.accounts[id]) state.accounts[id].status = status; });
  }
  async listAgents() { return this.inspect(state => Object.values(state.agents)); }
  async requestApproval(request: MandateRequest) {
    return this.mutate(state => {
      const existing = state.approvals.find(r => r.id === request.id || (r.agentId === request.agentId && r.principal === request.principal && ["pending", "approving"].includes(r.status)));
      if (existing) return existing;
      state.approvals.push(request);
      return request;
    });
  }
  async listApprovals() { return this.inspect(state => state.approvals); }
  async transitionApproval(id: string, from: MandateRequest["status"], to: MandateRequest["status"], mandateId?: string) {
    return this.mutate(state => {
      const request = state.approvals.find(r => r.id === id && r.status === from);
      if (!request) return false;
      request.status = to;
      if (mandateId) request.mandateId = mandateId;
      return true;
    });
  }
  constructor(private readonly filePath: string) {}

  private async locked<T>(work: () => Promise<T>): Promise<T> {
    const key = resolve(this.filePath);
    const previous = locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(key, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (locks.get(key) === tail) locks.delete(key);
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
