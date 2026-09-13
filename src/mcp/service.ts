import { randomUUID } from "node:crypto";
import type { GatewayRuntime } from "@/server/runtime";
import { requireDemoAdapters } from "@/demo/dashboard-run";
import { accountName, enroll } from "./enrollment";
import { accountChain, chainConfig } from "@/core/chains";

export class AgentService {
  constructor(private readonly runtime: GatewayRuntime, private readonly accountId?: string, private readonly enrollmentIpHash?: string, private readonly gatewayOrigin = "http://localhost:3000") {}
  private approvalUrl(id: string) { return new URL(`/owner?request=${encodeURIComponent(id)}`, this.gatewayOrigin).toString(); }
  get agentId() {
    if (!this.accountId) throw new Error("REFUSED — use your account_token: pass it as a tool argument, Bearer header or ?token=. Successful get_account binds that account to the MCP session; do not enroll again to reconnect.");
    return this.accountId;
  }
  private async account() {
    const account = await this.runtime.deps.store.getAccount(this.agentId);
    if (!account || account.status !== "ready") throw new Error("REFUSED — account provisioning is incomplete. Ask the owner to inspect it; no automatic retry.");
    return this.runtime.gateway.state(this.agentId);
  }
  async getAccount(name?: string, ownerEmail?: string, requestedChain?: string) {
    if (!this.accountId) return enroll(this.runtime, name, ownerEmail, this.enrollmentIpHash, requestedChain);
    const account = await this.runtime.deps.store.getAccount(this.agentId);
    if (!account || (name !== undefined && accountName.parse(name) !== account.name)) throw new Error("REFUSED — account token cannot access or create a different name.");
    if (requestedChain !== undefined && accountChain(requestedChain) !== accountChain(account.chain)) throw new Error("REFUSED — account token cannot change its chain. Existing Base accounts remain unchanged.");
    if (ownerEmail !== undefined && ownerEmail.trim().toLowerCase() !== account.ownerEmail) throw new Error("REFUSED — account token cannot change the owner identity.");
    if (account.status !== "ready") return { accountId: account.id, name: account.name, status: account.status, chain: accountChain(account.chain), network: chainConfig(account.chain).network,
      fundingAddress: (await this.runtime.deps.store.getAgent(account.id))?.walletAddress ?? null,
      detail: "Provisioning incomplete. Ask the owner to inspect this account before funding." };
    const state = await this.account();
    const decision = await this.runtime.gateway.checkMandate(this.agentId);
    const request = (await this.runtime.deps.store.listApprovals()).findLast(r => r.agentId === this.agentId && r.principal === account.tokenHash);
    return { accountId: this.agentId, ownerId: account.ownerId, status: account.status, chain: accountChain(state.agent.chain), network: chainConfig(state.agent.chain).network, testnet: chainConfig(state.agent.chain).testnet,
      name: state.agent.ensName, wallet: state.agent.walletAddress, fundingAddress: state.agent.walletAddress,
      ownership: state.agent.ownership?.kind ?? "app-owned-legacy", ownerEmail: state.agent.ownership?.ownerEmail,
      balance: await this.runtime.gateway.usdcBalance(this.agentId).catch(() => null), mandate: decision,
      requestStatus: request?.status ?? "none", moneyMode: this.runtime.health.adapters.privy.mode };
  }
  async requestMandate(purpose: string) {
    const state = await this.account();
    const decision = await this.runtime.gateway.checkMandate(this.agentId);
    if (decision.allowed) {
      const active = (await this.runtime.deps.store.listApprovals()).findLast(r => r.agentId === this.agentId && r.status === "approved");
      return { status: "active", chain: accountChain(state.agent.chain), decision, approval_url: active ? this.approvalUrl(active.id) : this.gatewayOrigin };
    }
    const request = await this.runtime.deps.store.requestApproval({ id: randomUUID(), agentId: this.agentId,
      principal: (await this.runtime.deps.store.getAccount(this.agentId))!.tokenHash, purpose, createdAt: this.runtime.deps.clock.now().toISOString(), status: "pending" });
    return { requestId: request.id, status: request.status, chain: accountChain(state.agent.chain), approval_url: this.approvalUrl(request.id), reason: "Waiting for the owner to approve and type CONFIRM. No permission granted." };
  }
  private async requireApproval() {
    if (this.runtime.health.adapters.privy.mode === "live") requireDemoAdapters(this.runtime, "live");
    const state = await this.account();
    const requests = await this.runtime.deps.store.listApprovals();
    const account = (await this.runtime.deps.store.getAccount(this.agentId))!;
    if (!requests.some(r => r.principal === account.tokenHash && r.agentId === this.agentId && r.status === "approved" && r.mandateId === state.mandate?.id)) {
      throw new Error("REFUSED — owner approval required. Call request_mandate and wait.");
    }
    // The gateway rechecks Arkiv before advice/payment and each individual signing call.
  }
  async pay(key: string) {
    await this.requireApproval();
    const recipient = this.runtime.deps.demoPaymentRecipient;
    if (!recipient) throw new Error("Owner must configure DEMO_PAYMENT_RECIPIENT.");
    return this.runtime.gateway.transferUsdc({ agentId: this.agentId, recipient, amountUsdcCents: 5, idempotencyKey: `mcp:${this.agentId}:${key}` });
  }
  async strategize(key: string) {
    await this.requireApproval();
    return this.runtime.gateway.strategize({ agentId: this.agentId, totalUsdcCents: 100, idempotencyKey: `mcp:${this.agentId}:${key}:advice` });
  }
  async save(key: string) {
    const state = await this.account();
    if (state.agent.chain === "avalanche-fuji") {
      // The gateway queries the mandate and records the unsupported-chain refusal; it cannot sign.
      return this.runtime.gateway.sweepIdle({ agentId: this.agentId, strategyId: "unsupported-on-fuji", amountUsdcCents: 100, idempotencyKey: `mcp:${this.agentId}:${key}:save` });
    }
    const strategy = await this.strategize(key);
    return this.runtime.gateway.sweepIdle({ agentId: this.agentId, strategyId: strategy.id, amountUsdcCents: 100, idempotencyKey: `mcp:${this.agentId}:${key}:save` });
  }
  async statement() {
    const state = await this.account();
    return { name: state.agent.ensName, chain: accountChain(state.agent.chain), moneyMode: this.runtime.health.adapters.privy.mode, mandate: await this.runtime.gateway.checkMandate(this.agentId),
      events: state.events.filter(e => !state.mandate || e.at >= state.mandate.createdAt).map(e => ({
        action: e.action, status: e.status, amountUsdcCents: e.amountUsdcCents, at: e.at, reason: e.reason, reference: e.reference, chain: accountChain(e.chain ?? state.agent.chain),
        proof_url: /^https:\/\/(basescan\.org\/tx|testnet\.snowtrace\.io\/tx|sepolia\.etherscan\.io\/tx|tiramisu\.explorer\.arkiv\.network\/entity)\/0x[0-9a-f]{64}$/i.test(e.reference ?? "") ? e.reference
          : this.runtime.health.adapters.privy.mode === "live" && !/MOCK|simulated/i.test(e.reason) && ["usdc.transfer", "earn.approve", "earn.sweep", "owner.transfer", "earn.recall"].includes(e.action) && /^0x[0-9a-f]{64}$/i.test(e.reference ?? "") ? `${chainConfig(e.chain ?? state.agent.chain).explorerUrl}/tx/${e.reference}` : undefined,
      })) };
  }
}

export async function decideRequest(runtime: GatewayRuntime, id: string, approve: boolean, confirmation?: string, ownerRecovery = false) {
  const store = runtime.deps.store;
  const request = (await store.listApprovals()).find(r => r.id === id);
  if (!request || request.status !== "pending") throw new Error("Request is not pending; it cannot be approved twice.");
  const account = await store.getAccount(request.agentId);
  if (account && (account.status !== "ready" || account.tokenHash !== request.principal)) throw new Error("Account is not ready or request belongs to stale credentials.");
  if (approve && confirmation !== "CONFIRM") throw new Error("Owner must type CONFIRM to authorize up to 1.20 USDC plus gas on this account's chain.");
  if (approve && runtime.health.adapters.privy.mode === "live") requireDemoAdapters(runtime, "live");
  if (!await store.transitionApproval(id, "pending", approve ? "approving" : "denied")) throw new Error("Request was already handled.");
  if (!approve) return { status: "denied" };
  try {
    const mandate = await runtime.gateway.grantMandate({ agentId: request.agentId, ownerId: account?.ownerId ?? "owner:token-approved",
      durationSeconds: 120, maxPerActionUsdcCents: 100, maxTotalUsdcCents: 120,
      allowedActions: accountChain(account?.chain ?? (await store.getAgent(request.agentId))?.chain) === "avalanche-fuji"
        ? ["usdc.transfer"] : ["usdc.transfer", "aimorgan.strategize", "earn.sweep", ...(ownerRecovery ? ["earn.recall", "owner.transfer"] as const : [])] });
    await store.transitionApproval(id, "approving", "approved", mandate.id);
    return { status: "approved", expiresAt: mandate.expiresAt };
  } catch {
    await store.transitionApproval(id, "approving", "failed");
    throw new Error("Approval did not complete. Inspect the mandate before requesting again; no automatic retry.");
  }
}
