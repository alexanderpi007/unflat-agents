import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { FileGatewayStore } from "./file-store";
import { MemoryGatewayStore } from "./store";
import type { StatementEvent } from "./types";

it("deduplicates reconciled completion by transaction without changing budget", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unflat-reconcile-"));
  try {
    for (const store of [new MemoryGatewayStore(), new FileGatewayStore(join(dir, "store.json"))]) {
      const event: StatementEvent = { id: "first", agentId: "agent", action: "earn.sweep", status: "completed", amountUsdcCents: 100, at: new Date().toISOString(), reference: "0xreceipt", reason: "Confirmed from receipt" };
      await Promise.all([store.appendEvent(event), store.appendEvent({ ...event, id: "second" })]);
      expect(await store.listEvents("agent")).toHaveLength(1);
      expect(await store.getMandate("agent")).toBeUndefined();
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});
