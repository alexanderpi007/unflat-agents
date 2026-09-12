import { afterEach, expect, it, vi } from "vitest";
import { MemoryGatewayStore } from "@/core/store";
import { authenticateAgent } from "./agent-auth";
import { tokenFingerprint } from "./role-auth";
afterEach(() => vi.unstubAllEnvs());
it("anonymous enrollment, account header/query, and all malformed/conflicting credentials fail closed", async () => {
  vi.stubEnv("VERCEL", ""); vi.stubEnv("OWNER_TOKEN", "operator-fixture-not-secret-1234567890");
  const store = new MemoryGatewayStore();
  const token = `unflat_account_${"a".repeat(64)}`;
  await store.reserveAccount({ id: "account", name: "test", ownerId: "owner", tokenHash: tokenFingerprint(token), status: "ready", createdAt: new Date().toISOString() });
  const req = (query = "", auth?: string) => new Request(`https://demo.example/api/mcp${query}`, { headers: auth ? { authorization: auth } : {} });
  expect(await authenticateAgent(req(), store)).toBeUndefined();
  expect(await authenticateAgent(req("", `Bearer ${token}`), store)).toBe("account");
  expect(await authenticateAgent(req(`?token=${token}`), store)).toBe("account");
  for (const request of [req("?token="), req(`?token=${token}&token=${token}`), req(`?token=wrong`, `Bearer ${token}`),
    req("", "Bearer obsolete-enrollment-token"), req("", "Bearer test.privy.jwt"), req("?token=bad")]) {
    await expect(authenticateAgent(request, store)).rejects.toThrow();
  }
});
