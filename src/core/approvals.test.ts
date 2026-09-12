import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { FileGatewayStore } from "./file-store";

it("persists requests and atomically claims approval across route store instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "unflat-approval-test-"));
  try {
    const file = join(directory, "gateway.json");
    const a = new FileGatewayStore(file), b = new FileGatewayStore(file);
    const request = { id: "test-request", agentId: "test-agent", principal: "token-hash", purpose: "test", status: "pending" as const, createdAt: new Date().toISOString() };
    await Promise.all([a.requestApproval(request), b.requestApproval({ ...request, id: "duplicate" })]);
    expect(await b.listApprovals()).toHaveLength(1);
    const stored = (await a.listApprovals())[0];
    expect((await Promise.all([a.transitionApproval(stored.id, "pending", "approving"), b.transitionApproval(stored.id, "pending", "approving")])).filter(Boolean)).toHaveLength(1);
    await a.transitionApproval(stored.id, "approving", "approved", "test-mandate");
    expect((await new FileGatewayStore(file).listApprovals())[0]).toMatchObject({ status: "approved", mandateId: "test-mandate" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
