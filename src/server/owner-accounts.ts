import type { GatewayRuntime } from "./runtime";
import { persistentAgentId } from "@/demo/dashboard-run";
import { decideRequest } from "@/mcp/service";

export async function listOwnerAccounts(runtime: GatewayRuntime) {
  const { store } = runtime.deps;
  const [agents, accounts] = await Promise.all([store.listAgents(), store.listAccounts()]);
  const ids = new Set(accounts.map(account => account.id));
  // Legacy MCP mirrors reused Atlas's wallet. Display that wallet once, as Atlas.
  const atlas = agents.find(agent => agent.id === persistentAgentId);
  for (const agent of agents) {
    if (agent.id === persistentAgentId || !atlas || agent.walletAddress.toLowerCase() !== atlas.walletAddress.toLowerCase()) ids.add(agent.id);
  }
  const rows = [];
  for (const id of ids) {
    const agent = agents.find(a => a.id === id);
    const account = accounts.find(a => a.id === id);
    const balance = agent ? await runtime.gateway.usdcBalance(id).catch(() => null) : null;
    const mandate = await runtime.gateway.checkMandate(id);
    rows.push({ id, name: agent?.ensName ?? `${account!.name}.agents.unflat.eth`,
      ownerId: account?.ownerId ?? agent?.ownerId ?? "owner:legacy",
      fundingAddress: agent?.walletAddress ?? null, balance,
      status: account?.status ?? "ready", mandate,
      ensExplorerUrl: `https://explorer.ens.dev/${agent?.ensName ?? `${account!.name}.agents.unflat.eth`}` });
  }
  return { accounts: rows, moneyMode: runtime.health.adapters.privy.mode,
    recipient: runtime.deps.demoPaymentRecipient,
    vault: runtime.deps.vaultAllowlist.find(v => v.execution === "direct-morpho")?.address };
}

export async function grantOwnerAccount(runtime: GatewayRuntime, agentId: string, requestId: string, confirmation: string) {
  if (confirmation !== "CONFIRM") throw new Error("Type CONFIRM for this account's two-minute, $1.20 mandate.");
  const { store } = runtime.deps;
  const agent = await store.getAgent(agentId);
  const account = await store.getAccount(agentId);
  if (!agent || (account && account.status !== "ready")) throw new Error("Account is not ready.");
  const principal = account?.tokenHash ?? `owner-direct:${agentId}`;
  const request = await store.requestApproval({ id: requestId, agentId, principal,
    purpose: "Owner-initiated budget for this account.", status: "pending", createdAt: runtime.deps.clock.now().toISOString() });
  if (request.agentId !== agentId || request.principal !== principal) throw new Error("Request belongs to a different account.");
  return decideRequest(runtime, request.id, true, confirmation);
}
