import { expect, it, vi } from "vitest";
import { enroll } from "./enrollment";
import { createMockRuntime, createApplicationRuntime } from "@/server/runtime";

const fixture = () => ({ ...createMockRuntime(), health: createApplicationRuntime({ fullyMocked: true }).health });
it("concurrent identical names create one wallet and preserve owner binding", async () => {
  const runtime = fixture();
  const identity = vi.spyOn(runtime.deps.ens, "createIdentity");
  const results = await Promise.allSettled([enroll(runtime, "NOVA", "owner@example.com"), enroll(runtime, " nova ", "owner@example.com")]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(runtime.wallet.calls.filter(call => call === "createOwnerWallet")).toHaveLength(1);
  expect(runtime.wallet.calls).not.toContain("createWallet");
  const [account] = await runtime.deps.store.listAccounts();
  const agent = await runtime.deps.store.getAgent(account.id);
  expect(identity).toHaveBeenCalledWith("nova", agent!.walletAddress, account.ownerId);
  expect(agent!.ownerId).toBe(account.ownerId);
});
it("rejects malformed or reserved labels before provisioning", async () => {
  const runtime = fixture();
  for (const name of [undefined, "", "atlas", "Atlas", "a.b", "../nova", "-nova", "nova-", "💰", "x".repeat(37)]) {
    await expect(enroll(runtime, name, "owner@example.com")).rejects.toThrow("REFUSED");
  }
  expect(runtime.wallet.calls).not.toContain("createWallet");
  expect(runtime.wallet.calls).not.toContain("createOwnerWallet");
});
it("requires the owner email before creating anything, and normalizes it for Privy", async () => {
  const runtime = fixture();
  for (const email of [undefined, "", "not-an-email"]) await expect(enroll(runtime, "nova", email)).rejects.toThrow("owner_email");
  expect(runtime.wallet.calls).toEqual([]);
  expect(await runtime.deps.store.listAccounts()).toEqual([]);
  const result = await enroll(runtime, "nova", " Owner@Example.com ");
  expect(result).toMatchObject({ ownerEmail: "owner@example.com", ownership: "privy-user" });
  expect((await runtime.deps.store.getAgent(result.accountId))!.ownership?.ownerEmail).toBe("owner@example.com");
});

it("persists Fuji on account and agent and returns that network with the Privy EVM address", async () => {
  const runtime = fixture();
  const result = await enroll(runtime, "fuji-nova", "owner@example.com", undefined, "avalanche-fuji");
  const account = await runtime.deps.store.getAccount(result.accountId);
  const agent = await runtime.deps.store.getAgent(result.accountId);
  expect(account?.chain).toBe("avalanche-fuji");
  expect(result).toMatchObject({ chain: "avalanche-fuji", network: "eip155:43113", testnet: true, fundingAddress: agent?.walletAddress });
  expect(agent).toMatchObject({ chain: "avalanche-fuji", ensName: "fuji-nova.agents.unflat.eth" });
  expect(runtime.wallet.calls).toEqual(["createOwnerWallet"]);
  await expect(runtime.gateway.getOrCreateAgent(result.accountId, "fuji-nova", account!.ownerId, account!.ownerEmail, "base")).rejects.toThrow("chain cannot be changed");
});

it("defaults new accounts to Base and rejects unknown chains before provisioning", async () => {
  const runtime = fixture();
  await expect(enroll(runtime, "badchain", "owner@example.com", undefined, "avalanche")).rejects.toThrow("unsupported account chain");
  expect(runtime.wallet.calls).toEqual([]);
  const result = await enroll(runtime, "base-nova", "owner@example.com");
  expect(result).toMatchObject({ chain: "base", network: "eip155:8453", testnet: false });
  expect((await runtime.deps.store.getAgent(result.accountId))!.chain).toBe("base");
});
it("retains the wallet and reserves the name after ENS failure without reissuing a token or provisioning again", async () => {
  const runtime = fixture();
  vi.spyOn(runtime.deps.ens, "createIdentity").mockRejectedValue(new Error("ENS unavailable"));
  const result = await enroll(runtime, "nova", "owner@example.com");
  expect(result.status).toBe("failed");
  expect(result.fundingAddress).toMatch(/^0x/);
  expect(result.accountToken).toMatch(/^unflat_account_/);
  await expect(enroll(runtime, "nova", "owner@example.com")).rejects.toThrow("reserved");
  expect(runtime.wallet.calls.filter(call => call === "createOwnerWallet")).toHaveLength(1);
  expect((await runtime.deps.store.getAccount(result.accountId))!.status).toBe("failed");
});
