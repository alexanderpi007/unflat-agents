import { afterEach, expect, it, vi } from "vitest";
import { erc20Abi } from "viem";
import { PrivyClient } from "@privy-io/node";
import { pregenerateOwnerWallet } from "./owner-wallet";
import { assertFujiPolicy } from "./fuji-policy";

afterEach(() => vi.unstubAllEnvs());
const manualFujiPolicy = {
  id: "policy-owner", owner_id: "user-quorum", chain_type: "ethereum", version: "1.0", name: "Manual Fuji pay",
  rules: [{ name: "Fuji USDC transfer", action: "ALLOW", method: "eth_sendTransaction", conditions: [
    { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: "43113" },
    { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" },
    { field_source: "ethereum_transaction", field: "to", operator: "eq", value: "0x5425890298aed601595a70AB815c96711a31Bc65" },
    { field_source: "ethereum_calldata", field: "function_name", operator: "eq", value: "transfer", abi: erc20Abi },
    { field_source: "ethereum_calldata", field: "transfer.amount", operator: "lte", value: "1000000", abi: erc20Abi },
  ] }],
};

const vaults = [{ id: "test-vault", label: "Test vault", execution: "direct-morpho" as const, address: `0x${"2".repeat(40)}` as const }];
function fixture(existing = false, appCoOwner = false) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  let externalId = "";
  const user = { id: "did:privy:test-owner", linked_accounts: [{ type: "email", address: "owner@example.com" }] };
  const client = new PrivyClient({ appId: "test-app", appSecret: "test-secret", maxRetries: 0,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const headers = new Headers(init?.headers);
      expect(headers.get("privy-app-id")).toBe("test-app");
      expect(headers.get("authorization")).toBe(`Basic ${Buffer.from("test-app:test-secret").toString("base64")}`);
      calls.push({ method: init?.method ?? "GET", path: url.pathname, body });
      if (url.pathname === "/v1/users/email/address") return Response.json(existing ? user : { error: "not found" }, { status: existing ? 200 : 404 });
      if (url.pathname === "/v1/users") return Response.json(user);
      if (url.pathname === "/v1/policies") return Response.json({ ...body, id: "policy-owner", owner_id: "user-quorum" });
      if (url.pathname === "/v1/policies/policy-owner") return Response.json(manualFujiPolicy);
      if (url.pathname === "/v1/users/did:privy:test-owner/wallets") {
        externalId = body.wallets[0].external_id; return Response.json(user);
      }
      if (url.pathname === "/v1/wallets") return Response.json({ data: [{ id: "new-wallet", chain_type: "ethereum", address: `0x${"3".repeat(40)}`,
        owner_id: "user-quorum", external_id: externalId, policy_ids: [], additional_signers: [{ signer_id: "session-signer", override_policy_ids: ["policy-owner"] }],
      }], next_cursor: null });
      if (url.pathname === "/v1/key_quorums/user-quorum") return Response.json({ user_ids: [user.id], authorization_threshold: 1,
        authorization_keys: appCoOwner ? [{ public_key: "server-key" }] : [], key_quorum_ids: [] });
      throw new Error(`Unexpected test-only Privy request: ${url.pathname}`);
    },
  });
  return { client, calls };
}

it("pregenerates a wallet for the email user with owner-owned policy and only an additional signer", async () => {
  const { client, calls } = fixture();
  const result = await pregenerateOwnerWallet(client, "session-signer", { ownerEmail: "owner@example.com", accountId: "account-1", vaults });
  expect(result.ownership).toMatchObject({ kind: "privy-user", ownerEmail: "owner@example.com", privyUserId: "did:privy:test-owner" });
  expect(calls.find(c => c.path === "/v1/users")!.body).toEqual({ linked_accounts: [{ type: "email", address: "owner@example.com" }] });
  expect(calls.find(c => c.path === "/v1/policies")!.body.owner).toEqual({ user_id: "did:privy:test-owner" });
  expect(calls.find(c => c.path.endsWith("test-owner/wallets"))!.body).toEqual({ wallets: [{ chain_type: "ethereum", external_id: "unflat_account-1", policy_ids: [],
    additional_signers: [{ signer_id: "session-signer", override_policy_ids: ["policy-owner"] }],
  }] });
  expect(calls.filter(c => c.path === "/v1/wallets" && c.method === "POST")).toHaveLength(0);
});

it("uses an existing email identity but asks for a new external-id wallet, never reuses its previous wallet", async () => {
  const { client, calls } = fixture(true);
  await pregenerateOwnerWallet(client, "session-signer", { ownerEmail: "owner@example.com", accountId: "account-2", vaults });
  expect(calls.some(c => c.path === "/v1/users")).toBe(false);
  expect(calls.find(c => c.path.endsWith("test-owner/wallets"))!.body.wallets).toEqual([expect.objectContaining({ external_id: "unflat_account-2" })]);
});

it("fails closed if the server is a co-owner, or the session signer is absent", async () => {
  const { client, calls } = fixture(false, true);
  const input = { ownerEmail: "owner@example.com", accountId: "account-3", vaults };
  await expect(pregenerateOwnerWallet(client, undefined, input)).rejects.toThrow("No app-owned fallback");
  expect(calls).toHaveLength(0);
  await expect(pregenerateOwnerWallet(client, "session-signer", input)).rejects.toThrow("solely user-owned");
});

it("Fuji enrollment reads a manually configured user-owned policy, never creates or edits one", async () => {
  vi.stubEnv("PRIVY_FUJI_POLICY_ID", "policy-owner");
  const { client, calls } = fixture(true);
  const result = await pregenerateOwnerWallet(client, "session-signer", { ownerEmail: "owner@example.com", accountId: "fuji-account", vaults, chain: "avalanche-fuji" });
  expect(result.address).toBe(`0x${"3".repeat(40)}`);
  expect(calls.filter(c => c.path.startsWith("/v1/policies"))).toEqual([{ method: "GET", path: "/v1/policies/policy-owner", body: {} }]);
  expect(calls.find(c => c.path.endsWith("test-owner/wallets"))!.body.wallets).toEqual([expect.objectContaining({ chain_type: "ethereum", additional_signers: [{ signer_id: "session-signer", override_policy_ids: ["policy-owner"] }] })]);
});

it("Fuji requires manual configuration before any provider call and rejects broad policies", async () => {
  vi.stubEnv("PRIVY_FUJI_POLICY_ID", "");
  const { client, calls } = fixture();
  await expect(pregenerateOwnerWallet(client, "session-signer", { ownerEmail: "owner@example.com", accountId: "fuji", vaults, chain: "avalanche-fuji" })).rejects.toThrow("PRIVY_FUJI_POLICY_ID");
  expect(calls).toEqual([]);
  type Policy = Parameters<typeof assertFujiPolicy>[0];
  expect(() => assertFujiPolicy(manualFujiPolicy as Policy)).not.toThrow();
  for (const field of ["chain_id", "value", "to", "function_name", "transfer.amount"]) {
    const policy = structuredClone(manualFujiPolicy);
    policy.rules[0].conditions = policy.rules[0].conditions.filter(c => c.field !== field);
    expect(() => assertFujiPolicy(policy as Policy)).toThrow("Configure it manually");
  }
  expect(() => assertFujiPolicy({ ...manualFujiPolicy, rules: [...manualFujiPolicy.rules, { name: "Broad", action: "ALLOW", method: "personal_sign", conditions: [] }] } as Policy)).toThrow("Configure it manually");
  const wrongAbi = { ...manualFujiPolicy, rules: manualFujiPolicy.rules.map(rule => ({ ...rule,
    conditions: rule.conditions.map(c => c.field_source === "ethereum_calldata" ? { ...c, abi: [] } : c),
  })) };
  expect(() => assertFujiPolicy(wrongAbi as Policy)).toThrow("Configure it manually");
});
