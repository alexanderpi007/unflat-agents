import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { FileGatewayStore } from "./file-store";
import { tokenFingerprint } from "@/server/role-auth";

it("persists one account claim and owner identity across store instances without storing bearer tokens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "unflat-account-test-"));
  try {
    const file = join(directory, "gateway.json");
    const a = new FileGatewayStore(file), b = new FileGatewayStore(file);
    const [ownerId, sameOwner] = await Promise.all([a.ensureOwnerId(), b.ensureOwnerId()]);
    expect(sameOwner).toBe(ownerId);
    const token = `unflat_account_${"a".repeat(64)}`;
    const account = { id: "nova-id", name: "nova", ownerId, tokenHash: tokenFingerprint(token), status: "provisioning" as const, createdAt: new Date().toISOString() };
    const claims = await Promise.all([a.reserveAccount(account), b.reserveAccount({ ...account, id: "duplicate-id" })]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const [stored] = await b.listAccounts();
    await a.finishAccount(stored.id, "ready");
    const reopened = new FileGatewayStore(file);
    expect(await reopened.findAccountByTokenHash(tokenFingerprint(token))).toMatchObject({ id: stored.id, status: "ready", ownerId });
    expect(await reopened.findAccountByTokenHash("unknown")).toBeUndefined();
    expect(await reopened.ensureOwnerId()).toBe(ownerId);
    expect(await readFile(file, "utf8")).not.toContain(token);
    expect(await reopened.reserveAccount({ ...account, id: "atlas-id", name: "atlas" })).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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
