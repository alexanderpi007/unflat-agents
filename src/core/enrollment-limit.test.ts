import { expect, it } from "vitest";
import { MemoryGatewayStore } from "./store";
import type { AgentAccount } from "./types";
import { FileGatewayStore } from "./file-store";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("persists the enrollment ceiling across file-store instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "unflat-enrollment-test-"));
  const path = join(directory, "gateway.json");
  const store = new FileGatewayStore(path);
  const row = (i: number): AgentAccount => ({ id: String(i), name: `test-${i}`, ownerId: "test",
    tokenHash: String(i), status: "failed", enrollmentIpHash: "test-ip-hash", createdAt: new Date().toISOString() });
  for (let i = 0; i < 5; i++) await store.reserveAccount(row(i));
  await expect(new FileGatewayStore(path).reserveAccount(row(5))).rejects.toThrow("rate limit");
});

it("atomically limits anonymous provisioning, including failures, and recovers after one hour", async () => {
  const store = new MemoryGatewayStore();
  const row = (i: number, ip = "hash-one", at = new Date().toISOString()): AgentAccount => ({
    id: String(i), name: `agent-${i}`, ownerId: "test", tokenHash: String(i), status: "provisioning", enrollmentIpHash: ip, createdAt: at,
  });
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => store.reserveAccount(row(i))));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(5);
  await store.finishAccount("0", "failed");
  await expect(store.reserveAccount(row(6))).rejects.toThrow("rate limit");
  expect(await store.reserveAccount(row(0))).toBe(false);
  for (let i = 10; i < 15; i++) await store.reserveAccount(row(i, `forged-${i}`));
  await expect(store.reserveAccount(row(15, "new-ip"))).rejects.toThrow("rate limit");
  expect(await store.reserveAccount(row(20, "hash-one", new Date(Date.now() + 3_600_100).toISOString()))).toBe(true);
});
