import { expect, it, vi } from "vitest";
import { enroll } from "./enrollment";
import { createMockRuntime, createApplicationRuntime } from "@/server/runtime";

const fixture = () => ({ ...createMockRuntime(), health: createApplicationRuntime({ fullyMocked: true }).health });
it("concurrent identical names create one wallet and preserve owner binding", async () => {
  const runtime = fixture();
  const identity = vi.spyOn(runtime.deps.ens, "createIdentity");
  const results = await Promise.allSettled([enroll(runtime, "NOVA"), enroll(runtime, " nova ")]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(runtime.wallet.calls.filter(call => call === "createWallet")).toHaveLength(1);
  const [account] = await runtime.deps.store.listAccounts();
  const agent = await runtime.deps.store.getAgent(account.id);
  expect(identity).toHaveBeenCalledWith("nova", agent!.walletAddress, account.ownerId);
  expect(agent!.ownerId).toBe(account.ownerId);
});
it("rejects malformed or reserved labels before provisioning", async () => {
  const runtime = fixture();
  for (const name of [undefined, "", "atlas", "Atlas", "a.b", "../nova", "-nova", "nova-", "💰", "x".repeat(37)]) {
    await expect(enroll(runtime, name)).rejects.toThrow("REFUSED");
  }
  expect(runtime.wallet.calls).not.toContain("createWallet");
});
it("retains the wallet and reserves the name after ENS failure without reissuing a token or provisioning again", async () => {
  const runtime = fixture();
  vi.spyOn(runtime.deps.ens, "createIdentity").mockRejectedValue(new Error("ENS unavailable"));
  const result = await enroll(runtime, "nova");
  expect(result.status).toBe("failed");
  expect(result.fundingAddress).toMatch(/^0x/);
  expect(result.accountToken).toMatch(/^unflat_account_/);
  await expect(enroll(runtime, "nova")).rejects.toThrow("reserved");
  expect(runtime.wallet.calls.filter(call => call === "createWallet")).toHaveLength(1);
  expect((await runtime.deps.store.getAccount(result.accountId))!.status).toBe("failed");
});
