import { expect, it, vi } from "vitest";
import { FakeClock } from "@/core/clock";
import { createMockRuntime, type GatewayRuntime } from "@/server/runtime";
import { demoAgent, persistentAgentId, persistentWalletAddress, runDashboardSequence, type DashboardUpdate } from "./dashboard-run";

it("LIVE reads the persistent wallet and never creates a replacement", async () => {
  const mock = createMockRuntime();
  const runtime = mock as unknown as GatewayRuntime;
  const createWallet = vi.spyOn(mock.wallet, "createWallet");
  await expect(demoAgent(runtime, "live")).rejects.toThrow("Persistent Privy wallet missing");
  const agent = { id: persistentAgentId, walletAddress: persistentWalletAddress, walletId: "stored-privy-id",
    displayName: "Atlas", ensName: "atlas.agents.unflat.eth", createdAt: new Date().toISOString() } as const;
  await mock.deps.store.putAgent(agent);
  await expect(demoAgent(runtime, "live")).resolves.toEqual(agent);
  expect(createWallet).not.toHaveBeenCalled();
});

it("reuses the displayed wallet, grants 120s, queries expiry and refuses without extra signatures", async () => {
  const clock = new FakeClock(new Date());
  const mock = createMockRuntime(clock);
  const runtime = { ...mock } as unknown as GatewayRuntime;
  const createWallet = vi.spyOn(mock.wallet, "createWallet");
  const publish = vi.spyOn(mock.deps.arkiv, "publishMandate");
  const query = vi.spyOn(mock.deps.arkiv, "findValidMandates");
  const agent = await demoAgent(runtime, "mock");
  const next = await demoAgent(runtime, "mock");
  expect(agent.walletAddress).toBe(persistentWalletAddress);
  expect(next.walletAddress).toBe(agent.walletAddress);
  expect(createWallet).not.toHaveBeenCalled();
  const updates: DashboardUpdate[] = [];
  await runDashboardSequence(runtime, agent, "mock", "test-run", update => updates.push(update), async ms => clock.advance(ms));
  expect(publish).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 120 }));
  expect(query.mock.calls.length).toBeGreaterThan(10);
  expect(updates[0].query?.found).toBe(true);
  expect(updates.at(-1)).toMatchObject({ expired: true, query: { found: false, entities: [] } });
  expect(updates.at(-1)?.snapshot?.events.at(-1)?.status).toBe("refused");
  expect(updates.at(-1)?.snapshot?.events.some(e => e.reason.includes("https://basescan.org"))).toBe(false);
});
