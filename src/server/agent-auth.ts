import type { GatewayStore } from "@/core/ports";
import { requireConfiguredRequest, requireRole, tokenFingerprint } from "./role-auth";

export async function authenticateAgent(request: Request, store: GatewayStore): Promise<string | undefined> {
  const { authorization } = requireConfiguredRequest(request);
  const match = /^Bearer (unflat_account_[a-f0-9]{64})$/.exec(authorization);
  if (match) {
    const account = await store.findAccountByTokenHash(tokenFingerprint(match[1]));
    if (!account) throw new Error("Invalid account token.");
    return account.id;
  }
  requireRole(request, "agent");
  return undefined; // Enrollment credential: no authority over any existing account.
}
