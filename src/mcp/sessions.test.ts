import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FakeClock } from "@/core/clock";
import { createMockRuntime, createApplicationRuntime, type GatewayRuntime } from "@/server/runtime";
import { handleMcp } from "./http";
import { decideRequest } from "./service";

const origin = "https://connector.example";
const operator = "operator-test-not-secret-12345678901234";
let runtime: ReturnType<typeof createMockRuntime> & Pick<GatewayRuntime, "health">;
const clients: Client[] = [];
beforeEach(() => {
  vi.stubEnv("VERCEL", ""); vi.stubEnv("OWNER_TOKEN", operator);
  runtime = { ...createMockRuntime(new FakeClock(new Date())), health: createApplicationRuntime({ fullyMocked: true }).health };
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()));
  for (const entry of globalThis.unflatMcpSessionsV1?.values() ?? []) await entry.server.close();
  globalThis.unflatMcpSessionsV1?.clear();
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
async function connect(token?: string, query = false) {
  const client = new Client({ name: "fixed-url-connector", version: "1" });
  clients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL(origin + "/api/mcp" + (query && token ? `?token=${token}` : "")), {
    requestInit: { headers: token && !query ? { authorization: `Bearer ${token}` } : {} },
    fetch: (url, init) => handleMcp(new Request(url, init), runtime),
  });
  await client.connect(transport);
  return { client, transport, tool: (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) };
}
type ToolResponse = Awaited<ReturnType<Client["callTool"]>>;
const data = (response: ToolResponse) => response.structuredContent as Record<string, unknown>;
async function open(name: string) {
  const connection = await connect();
  const result = data(await connection.tool("get_account", { name, owner_email: "owner@example.com" }));
  return { ...connection, token: result.account_token as string, accountId: result.accountId as string, result };
}
function raw(method: string, session?: string, args: Record<string, unknown> = {}, header?: string, endpoint = origin) {
  return new Request(endpoint + "/api/mcp", { method: "POST", headers: {
    accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-11-25",
    ...(session !== undefined ? { "mcp-session-id": session } : {}), ...(header ? { authorization: `Bearer ${header}` } : {}),
  }, body: JSON.stringify({ jsonrpc: "2.0", id: 123, method: "tools/call", params: { name: method, arguments: args } }) });
}

it("fixed URL/no headers: discovery → enroll → approve → pay/save → expiry refusal in one bound session", async () => {
  const account = await open("session-nova");
  const tools = (await account.client.listTools()).tools;
  expect(tools).toHaveLength(6);
  for (const tool of tools) {
    expect(tool.inputSchema.properties).toHaveProperty("account_token");
    expect(tool.description).toContain("Pass the account_token you received from get_account");
  }
  expect(account.client.getInstructions()?.split("\n")).toHaveLength(5);
  expect(account.result.session_bound).toBe(true);
  expect(account.transport.sessionId).toMatch(/^[a-f0-9]{64}$/);
  expect(data(await account.tool("get_account"))).toMatchObject({ accountId: account.accountId, session_bound: true });
  expect(JSON.stringify(await account.tool("get_account"))).not.toContain(account.token);
  expect((await account.tool("pay", { amountUsdcCents: 5, idempotency_key: "before-confirm" })).isError).toBe(true);
  const pending = data(await account.tool("request_mandate", { purpose: "Pay and save" }));
  expect(pending.approval_url).toContain("/owner?request=");
  await decideRequest(runtime, pending.requestId as string, true, "CONFIRM");
  expect((await account.tool("pay", { amountUsdcCents: 5, idempotency_key: "session-pay" })).isError).toBe(false);
  expect((await account.tool("save", { amountUsdcCents: 100, idempotency_key: "session-save" })).isError).toBe(false);
  (runtime.deps.clock as FakeClock).advance(120_001);
  const wallet = runtime.deps.wallet;
  const spies = [vi.spyOn(wallet, "transferUsdc"), vi.spyOn(wallet, "approveUsdc"), vi.spyOn(wallet, "depositDirectVault"), vi.spyOn(runtime.deps.aiMorgan, "strategize")];
  const refused = data(await account.tool("pay", { amountUsdcCents: 5, idempotency_key: "session-expired" }));
  expect(refused).toMatchObject({ status: "REFUSED", expected: true, retryable: false, budget_left: 15 });
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  const statement = await account.tool("statement");
  expect(JSON.stringify(statement)).toContain("refused");
  for (const secret of [account.token, account.transport.sessionId!, operator]) expect(JSON.stringify(statement)).not.toContain(secret);
});

it("all scoped tools accept argument-only tokens; get_account binds an existing account without re-enrollment", async () => {
  const account = await open("argument-nova");
  const newcomer = await connect();
  expect((await newcomer.tool("statement")).isError).toBe(true);
  const args = { account_token: account.token };
  const pending = data(await newcomer.tool("request_mandate", { ...args, purpose: "Argument-only client" }));
  await decideRequest(runtime, pending.requestId as string, true, "CONFIRM");
  expect((await newcomer.tool("pay", { ...args, amountUsdcCents: 5, idempotency_key: "argument-pay" })).isError).toBe(false);
  expect((await newcomer.tool("strategize", { ...args, idempotency_key: "argument-advice" })).isError).toBe(false);
  expect((await newcomer.tool("save", { ...args, amountUsdcCents: 100, idempotency_key: "argument-save" })).isError).toBe(false);
  expect((await newcomer.tool("statement", args)).isError).toBe(false);
  expect((await newcomer.tool("statement")).isError).toBe(true); // Only get_account establishes implicit authority.
  const wallets = vi.spyOn(runtime.deps.wallet, "createOwnerWallet");
  expect(data(await newcomer.tool("get_account", args))).toMatchObject({ accountId: account.accountId, session_bound: true });
  expect((await newcomer.tool("statement")).isError).toBe(false);
  expect(wallets).not.toHaveBeenCalled();
  expect(JSON.stringify(await newcomer.tool("statement"))).not.toContain(account.token);
  // Clients that drop MCP session headers can still pass the argument on each POST.
  const stateless = await (await handleMcp(raw("get_account", undefined, args), runtime)).json();
  expect(stateless.result.structuredContent).toMatchObject({ accountId: account.accountId, session_bound: false });
});

it("sessions are isolated; conflicting, invalid and operator credentials cannot override binding", async () => {
  const first = await open("first"), second = await open("second");
  const wallet = vi.spyOn(runtime.deps.wallet, "transferUsdc");
  for (const account_token of [second.token, `unflat_account_${"f".repeat(64)}`, operator, "", `${first.token}secret-suffix`]) {
    const result = await first.tool("get_account", { account_token });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(account_token || "secret-suffix");
  }
  expect((await first.tool("get_account", { name: "replacement", owner_email: "owner@example.com" })).isError).toBe(true);
  expect(data(await first.tool("get_account")).accountId).toBe(first.accountId);
  expect(data(await second.tool("get_account")).accountId).toBe(second.accountId);
  const unbound = await connect();
  expect((await unbound.tool("statement")).isError).toBe(true);
  for (const query of [false, true]) {
    const explicit = await connect(first.token, query);
    expect((await explicit.tool("get_account", { account_token: second.token })).isError).toBe(true);
    expect(data(await explicit.tool("get_account", { account_token: first.token })).accountId).toBe(first.accountId);
  }
  expect((await handleMcp(raw("statement", first.transport.sessionId, {}, second.token), runtime)).status).toBe(403);
  expect((await handleMcp(raw("statement", first.transport.sessionId, { account_token: first.token }, "invalid"), runtime)).status).toBe(403);
  expect((await handleMcp(raw("statement", first.transport.sessionId, {}, undefined, "https://another.example"), runtime)).status).toBe(404);
  expect(wallet).not.toHaveBeenCalled();
  vi.stubEnv("VERCEL", "1");
  expect((await handleMcp(raw("statement", first.transport.sessionId, { account_token: first.token }), runtime)).status).toBe(403);
});

it("server-generated sessions expire, can be deleted, and cannot be fabricated; saved tokens recover without wallets", async () => {
  const account = await open("recover-session");
  const id = account.transport.sessionId!;
  const entry = globalThis.unflatMcpSessionsV1!.get(id)!;
  entry.expiresAt = Date.now() - 1;
  expect((await handleMcp(raw("statement", id), runtime)).status).toBe(404);
  expect((await handleMcp(raw("get_account", "attacker-chosen-id", { name: "must-not-enroll", owner_email: "owner@example.com" }), runtime)).status).toBe(404);
  const resumed = await connect();
  expect((await resumed.tool("statement")).isError).toBe(true);
  expect(data(await resumed.tool("get_account", { account_token: account.token })).accountId).toBe(account.accountId);
  const resumedId = resumed.transport.sessionId!;
  await resumed.transport.terminateSession();
  expect((await handleMcp(raw("statement", resumedId), runtime)).status).toBe(404);
  expect(await runtime.deps.store.listAccounts()).toHaveLength(1);
});

it("concurrent get_account calls cannot bind/create two accounts in one session", async () => {
  const connection = await connect();
  const results = await Promise.all(["parallel-one", "parallel-two"].map(name => connection.tool("get_account", { name, owner_email: "owner@example.com" })));
  expect(results.filter(result => !result.isError)).toHaveLength(1);
  expect(await runtime.deps.store.listAccounts()).toHaveLength(1);
  const only = data(results.find(result => !result.isError)!);
  expect(data(await connection.tool("get_account")).accountId).toBe(only.accountId);
});

it("binding cannot outlive invalidation of the account credential in the store", async () => {
  const account = await open("credential-check");
  const original = await runtime.deps.store.getAccount(account.accountId);
  vi.spyOn(runtime.deps.store, "getAccount").mockResolvedValue({ ...original!, tokenHash: "invalidated-fingerprint" });
  const result = await account.tool("statement");
  expect(result.isError).toBe(true);
  expect(data(result).reason).toContain("credential is no longer valid");
  expect(JSON.stringify(result)).not.toContain(account.token);
});
