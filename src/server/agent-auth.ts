import type { GatewayStore } from "@/core/ports";
import { requireConfiguredRequest, tokenFingerprint } from "./role-auth";

export async function authenticateAgent(request: Request, store: GatewayStore, argument?: string): Promise<string | undefined> {
  const { authorization } = requireConfiguredRequest(request);
  const query = new URL(request.url).searchParams.getAll("token");
  const header = /^Bearer (unflat_account_[a-f0-9]{64})$/.exec(authorization)?.[1];
  if (query.length > 1 || (authorization && !header) || (header && query.length && header !== query[0])) throw new Error("Invalid or conflicting account credentials.");
  const credentials = [header, query[0], argument].filter((value): value is string => value !== undefined);
  if (new Set(credentials).size > 1) throw new Error("Invalid or conflicting account credentials.");
  const token = credentials[0];
  if (token !== undefined) {
    if (!/^unflat_account_[a-f0-9]{64}$/.test(token)) throw new Error("Invalid account token.");
    const account = await store.findAccountByTokenHash(tokenFingerprint(token));
    if (!account) throw new Error("Invalid account token.");
    return account.id;
  }
  return undefined; // Anonymous discovery/enrollment only; no authority over an existing account.
}
