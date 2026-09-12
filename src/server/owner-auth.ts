import type { Agent, AgentAccount } from "@/core/types";
import type { GatewayStore } from "@/core/ports";
import { requireConfiguredRequest, requireRole } from "./role-auth";
import { verifyPrivyOwner } from "./privy-owner";

export type OwnerPrincipal = { role: "operator" } | { role: "owner"; userId: string; emails: string[] };
export async function authenticateOwner(request: Request): Promise<OwnerPrincipal> {
  const { authorization } = requireConfiguredRequest(request);
  try { requireRole(request, "owner"); return { role: "operator" }; } catch { /* Privy owner, not operator override. */ }
  const token = /^Bearer ([^\s]+)$/.exec(authorization)?.[1];
  if (!token || token.startsWith("unflat_account_") || token.split(".").length !== 3) throw new Error("Privy owner login required.");
  return { role: "owner", ...await verifyPrivyOwner(token) };
}
export function ownsAccount(principal: OwnerPrincipal, account?: AgentAccount, agent?: Agent) {
  if (principal.role === "operator") return true;
  const identity = agent?.ownership;
  return identity?.kind === "privy-user" && identity.privyUserId === principal.userId
    && principal.emails.includes(identity.ownerEmail.toLowerCase())
    && (!account?.ownerEmail || principal.emails.includes(account.ownerEmail.toLowerCase()));
}
export async function requireOwnedAccount(principal: OwnerPrincipal, store: GatewayStore, id: string) {
  const [account, agent] = await Promise.all([store.getAccount(id), store.getAgent(id)]);
  if (!agent || !ownsAccount(principal, account, agent)) throw new Error("This account does not belong to your verified Privy email.");
}
