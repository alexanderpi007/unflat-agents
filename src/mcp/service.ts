import { randomUUID } from "node:crypto";
import type { GatewayRuntime } from "@/server/runtime";
import { persistentAgentId, requireDemoAdapters } from "@/demo/dashboard-run";

export class AgentService {
  constructor(private readonly runtime: GatewayRuntime, private readonly principal: string) {}
  get agentId() {
    const p = this.principal;
    return `${p.slice(0, 8)}-${p.slice(8, 12)}-4${p.slice(13, 16)}-8${p.slice(17, 20)}-${p.slice(20, 32)}`;
  }
  private async account() {
    const { store } = this.runtime.deps;
    if (!await store.getAgent(this.agentId)) {
      const source = await store.getAgent(persistentAgentId);
      if (!source) throw new Error("Persistent wallet missing; ask the owner to restore the gateway store.");
      await store.putAgent({ ...source, id: this.agentId, createdAt: this.runtime.deps.clock.now().toISOString() });
    }
    return this.runtime.gateway.state(this.agentId);
  }
  async getAccount() {
    const state = await this.account();
    const decision = await this.runtime.gateway.checkMandate(this.agentId);
    const request = (await this.runtime.deps.store.listApprovals()).findLast(r => r.principal === this.principal);
    return { name: state.agent.ensName, wallet: state.agent.walletAddress,
      balance: await this.runtime.gateway.usdcBalance(this.agentId), mandate: decision,
      requestStatus: request?.status ?? "none", moneyMode: this.runtime.health.adapters.privy.mode };
  }
  async requestMandate(purpose: string) {
    await this.account();
    const decision = await this.runtime.gateway.checkMandate(this.agentId);
    if (decision.allowed) return { status: "active", decision };
    const request = await this.runtime.deps.store.requestApproval({ id: randomUUID(), agentId: this.agentId,
      principal: this.principal, purpose, createdAt: this.runtime.deps.clock.now().toISOString(), status: "pending" });
    return { requestId: request.id, status: request.status, reason: "Waiting for the owner to approve and type CONFIRM. No permission granted." };
  }
  private async requireApproval() {
    if (this.runtime.health.adapters.privy.mode === "live") requireDemoAdapters(this.runtime, "live");
    const state = await this.account();
    const requests = await this.runtime.deps.store.listApprovals();
    if (!requests.some(r => r.principal === this.principal && r.agentId === this.agentId && r.status === "approved" && r.mandateId === state.mandate?.id)) {
      throw new Error("REFUSED — owner approval required. Call request_mandate and wait.");
    }
    // The gateway rechecks Arkiv before advice/payment and each individual signing call.
  }
  async pay(key: string) {
    await this.requireApproval();
    const recipient = this.runtime.deps.demoPaymentRecipient;
    if (!recipient) throw new Error("Owner must configure DEMO_PAYMENT_RECIPIENT.");
    return this.runtime.gateway.transferUsdc({ agentId: this.agentId, recipient, amountUsdcCents: 5, idempotencyKey: `mcp:${key}` });
  }
  async strategize(key: string) {
    await this.requireApproval();
    return this.runtime.gateway.strategize({ agentId: this.agentId, totalUsdcCents: 100, idempotencyKey: `mcp:${key}:advice` });
  }
  async save(key: string) {
    const strategy = await this.strategize(key);
    return this.runtime.gateway.sweepIdle({ agentId: this.agentId, strategyId: strategy.id, amountUsdcCents: 100, idempotencyKey: `mcp:${key}:save` });
  }
  async statement() {
    const state = await this.account();
    return { name: state.agent.ensName, mandate: await this.runtime.gateway.checkMandate(this.agentId),
      events: state.events.filter(e => !state.mandate || e.at >= state.mandate.createdAt).map(e => ({
        action: e.action, status: e.status, amountUsdcCents: e.amountUsdcCents, at: e.at, reason: e.reason, reference: e.reference,
      })) };
  }
}

export async function decideRequest(runtime: GatewayRuntime, id: string, approve: boolean, confirmation?: string) {
  const store = runtime.deps.store;
  const request = (await store.listApprovals()).find(r => r.id === id);
  if (!request || request.status !== "pending") throw new Error("Request is not pending; it cannot be approved twice.");
  if (approve && confirmation !== "CONFIRM") throw new Error("Owner must type CONFIRM to authorize up to 1.20 USDC plus Base gas.");
  if (approve && runtime.health.adapters.privy.mode === "live") requireDemoAdapters(runtime, "live");
  if (!await store.transitionApproval(id, "pending", approve ? "approving" : "denied")) throw new Error("Request was already handled.");
  if (!approve) return { status: "denied" };
  try {
    const mandate = await runtime.gateway.grantMandate({ agentId: request.agentId, ownerId: "owner:token-approved",
      durationSeconds: 120, maxPerActionUsdcCents: 100, maxTotalUsdcCents: 120,
      allowedActions: ["usdc.transfer", "aimorgan.strategize", "earn.sweep"] });
    await store.transitionApproval(id, "approving", "approved", mandate.id);
    return { status: "approved", expiresAt: mandate.expiresAt };
  } catch {
    await store.transitionApproval(id, "approving", "failed");
    throw new Error("Approval did not complete. Inspect the mandate before requesting again; no automatic retry.");
  }
}
