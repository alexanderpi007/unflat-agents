import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FakeClock } from "@/core/clock";
import type { Dependencies } from "@/core/ports";
import { persistentAgentId } from "@/demo/dashboard-run";
import { runtime } from "@/server/runtime";
import { POST, GET } from "@/app/api/mcp/route";
import { POST as approve, GET as approvals } from "@/app/api/owner/approvals/route";
import { GET as accounts, POST as grant } from "@/app/api/owner/accounts/route";
import { POST as recover } from "@/app/api/owner/recovery/route";
import { verifyPrivyOwner } from "@/server/privy-owner";

vi.mock("@/server/privy-owner", () => ({ verifyPrivyOwner: vi.fn() }));

vi.mock("@/server/runtime", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/runtime")>();
  const { FakeClock } = await import("@/core/clock");
  return { ...actual, runtime: { ...actual.createMockRuntime(new FakeClock(new Date())),
    health: actual.createApplicationRuntime({ fullyMocked: true }).health } };
});
const owner = "test-owner-token-not-a-secret-123456789";
const agent = "test-agent-token-not-a-secret-123456789";
const base = "https://demo-example.ngrok-free.app";
const request = (path: string, token: string, body?: unknown) => new Request(base + path, {
  method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, origin: base, host: new URL(base).host, "content-type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});
beforeEach(() => {
  vi.stubEnv("VERCEL", ""); vi.stubEnv("OWNER_TOKEN", owner);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function connect(token?: string, query = false) {
  const client = new Client({ name: "fake-agent", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/api/mcp" + (query && token ? `?token=${encodeURIComponent(token)}` : "")), {
    requestInit: { headers: { ...(token && !query ? { Authorization: `Bearer ${token}` } : {}) } },
    fetch: async (url, init) => { const req = new Request(url, init); return req.method === "POST" ? POST(req) : GET(req); },
  }));
  return client;
}
function body(result: Awaited<ReturnType<Client["callTool"]>>) {
  return JSON.parse((result.content as { text: string }[])[0].text);
}

it("Privy owners see and approve only their own account; operator override stays API-only", async () => {
  const enrollment = await connect();
  const created = body(await enrollment.callTool({ name: "get_account", arguments: { name: "email-owner", owner_email: "giacomo@example.com" } }));
  const scoped = await connect(created.account_token, true);
  try {
    expect(body(await scoped.callTool({ name: "get_account", arguments: {} })).accountToken).toBeUndefined();
    const pending = body(await scoped.callTool({ name: "request_mandate", arguments: { purpose: "Email owner approval" } }));
    const id = new URL(pending.approval_url).searchParams.get("request")!;
    const wallet = await runtime.deps.store.getAgent(created.accountId);
    const identity = wallet!.ownership!;
    if (identity.kind !== "privy-user") throw new Error("Owner-owned fixture required");
    const jwt = "test.privy.jwt";
    const verify = vi.mocked(verifyPrivyOwner);
    for (const principal of [
      { userId: identity.privyUserId, emails: ["wrong@example.com"] },
      { userId: "did:privy:impostor", emails: ["giacomo@example.com"] },
    ]) {
      verify.mockResolvedValue(principal);
      expect((await (await accounts(request("/api/owner/accounts", jwt))).json()).accounts).toEqual([]);
      expect((await (await approvals(request(`/api/owner/approvals?request=${id}`, jwt))).json()).request).toBeNull();
      expect((await approve(request("/api/owner/approvals", jwt, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(403);
      expect((await approve(request("/api/owner/approvals", jwt, { id, action: "deny" }))).status).toBe(403);
      expect((await grant(request("/api/owner/accounts", jwt, { accountId: created.accountId, confirmation: "CONFIRM", requestId: id }))).status).toBe(403);
      expect((await recover(request("/api/owner/recovery", jwt, { accountId: created.accountId, action: "owner.transfer", confirmation: "CONFIRM", requestId: id, amountUsdcCents: 100, recipient: `0x${"9".repeat(40)}` }))).status).toBe(403);
    }
    verify.mockResolvedValue({ userId: identity.privyUserId, emails: ["giacomo@example.com"] });
    const listed = await (await accounts(request("/api/owner/accounts", jwt))).json();
    expect(listed.accounts.map((a: { id: string }) => a.id)).toEqual([created.accountId]);
    expect((await (await approvals(request(`/api/owner/approvals?request=${id}`, jwt))).json()).pending).toHaveLength(1);
    expect((await approve(request("/api/owner/approvals", jwt, { id, action: "approve" }))).status).toBe(400);
    expect((await approve(request("/api/owner/approvals", jwt, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(200);
    expect((await (await approvals(request(`/api/owner/approvals?request=${id}`, jwt))).json()).request.status).toBe("approved");
    expect(body(await scoped.callTool({ name: "get_account", arguments: {} })).mandate.allowed).toBe(true);
    verify.mockRejectedValue(new Error("Invalid signature"));
    expect((await accounts(request("/api/owner/accounts", jwt))).status).toBe(403);
    expect((await accounts(request("/api/owner/accounts", owner))).status).toBe(200);
    vi.stubEnv("VERCEL", "1");
    expect((await accounts(request("/api/owner/accounts", owner))).status).toBe(403);
    expect((await accounts(request("/api/owner/accounts", jwt))).status).toBe(403);
  } finally { await enrollment.close(); await scoped.close(); }
});

it("fake HTTP client: request → remote owner CONFIRM → pay → save → expiry → refusal", async () => {
  await runtime.gateway.getOrCreateAgent(persistentAgentId, "Atlas");
  const atlas = await runtime.deps.store.getAgent(persistentAgentId);
  const enrollment = await connect();
  expect(enrollment.getInstructions()).toContain("account_token");
  const discovered = (await enrollment.listTools()).tools;
  expect(discovered.find(t => t.name === "request_mandate")?.description).toContain("approval_url");
  expect((await enrollment.callTool({ name: "statement", arguments: {} })).isError).toBe(true);
  const created = body(await enrollment.callTool({ name: "get_account", arguments: { name: "Nova", owner_email: "owner@example.com" } }));
  expect(created).toMatchObject({ name: "nova.agents.unflat.eth", status: "ready" });
  expect(created.accountToken).toMatch(/^unflat_account_[a-f0-9]{64}$/);
  expect(created.fundingAddress).not.toBe(atlas!.walletAddress);
  const duplicate = await enrollment.callTool({ name: "get_account", arguments: { name: "nova", owner_email: "owner@example.com" } });
  expect(duplicate.isError).toBe(true);
  expect(JSON.stringify(duplicate)).not.toContain(created.accountToken);
  expect((await enrollment.callTool({ name: "get_account", arguments: { name: "atlas" } })).isError).toBe(true);
  await enrollment.close();
  const client = await connect(created.accountToken);
  try {
    expect((await client.listTools()).tools.map(t => t.name).sort()).toEqual(["get_account", "pay", "request_mandate", "save", "statement", "strategize"]);
    const tool = (name: string, args = {}) => client.callTool({ name, arguments: args });
    const account = await tool("get_account");
    expect(account.isError).not.toBe(true);
    expect(JSON.stringify(account)).not.toContain(created.accountToken);
    expect((await tool("get_account", { name: "atlas" })).isError).toBe(true);
    expect((await tool("statement")).isError).not.toBe(true);
    expect((await tool("grant_mandate")).isError).toBe(true);
    const requested = body(await tool("request_mandate", { purpose: "Send five cents, save one dollar." }));
    expect(requested.approval_url).toMatch(/^https:\/\/demo-example.ngrok-free.app\/owner\?request=/);
    expect(requested.next_step).toContain(requested.approval_url);
    const pending = (await (await approvals(request("/api/owner/approvals", owner))).json()).pending;
    expect(pending).toHaveLength(1);
    expect(JSON.stringify(pending)).not.toContain("principal");
    const id = pending[0].id;
    expect((await tool("pay", { amountUsdcCents: 5, idempotencyKey: "before-approval" })).isError).toBe(true);
    expect((await approve(request("/api/owner/approvals", agent, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(403);
    expect((await approve(request("/api/owner/approvals", owner, { id, action: "approve" }))).status).toBe(400);
    expect((await approve(request("/api/owner/approvals", owner, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(200);
    expect((await approve(request("/api/owner/approvals", owner, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(400);
    expect((await tool("pay", { amountUsdcCents: 5, idempotency_key: "approved-pay" })).isError).not.toBe(true);
    expect((await tool("pay", { amountUsdcCents: 100, idempotencyKey: "arbitrary-pay" })).isError).toBe(true);
    expect((await tool("save", { amountUsdcCents: 100, idempotencyKey: "approved-save" })).isError).not.toBe(true);
    const mandate = await runtime.deps.store.getMandate(pending[0].agentId);
    expect(mandate!.maxTotalUsdcCents - mandate!.spentUsdcCents).toBe(15);
    (runtime.deps.clock as FakeClock).advance(120_001);
    const wallet = (runtime.deps as Dependencies).wallet;
    const signing = [vi.spyOn(wallet, "transferUsdc"), vi.spyOn(wallet, "approveUsdc"), vi.spyOn(wallet, "depositDirectVault")];
    const advice = vi.spyOn(runtime.deps.aiMorgan, "strategize");
    for (const name of ["pay", "save", "strategize"]) {
      const result = await tool(name, { ...(name === "strategize" ? {} : { amountUsdcCents: name === "pay" ? 5 : 100 }), idempotencyKey: `expired-${name}` });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({ status: "REFUSED", expected: true });
      expect(JSON.stringify(result)).toContain("REFUSED");
    }
    for (const spy of [...signing, advice]) expect(spy).not.toHaveBeenCalled();
    const statement = await tool("statement");
    expect(statement.isError).not.toBe(true);
    expect(JSON.stringify(statement)).toContain("refused");
    expect(JSON.stringify(statement)).not.toContain(owner);
    expect(JSON.stringify(statement)).not.toContain(agent);
    expect((await tool("get_account")).isError).not.toBe(true);
    expect(await runtime.deps.store.getAgent(persistentAgentId)).toEqual(atlas);
    expect(await runtime.deps.store.getMandate(persistentAgentId)).toBeUndefined();
  } finally { await client.close(); }
});

it("two scoped clients cannot read, spend, save or grant for each other; owner sees both balances", async () => {
  const enrollment = await connect();
  const first = body(await enrollment.callTool({ name: "get_account", arguments: { name: "comet", owner_email: "owner@example.com" } }));
  const second = body(await enrollment.callTool({ name: "get_account", arguments: { name: "luna", owner_email: "owner@example.com" } }));
  const one = await connect(first.accountToken), two = await connect(second.accountToken);
  try {
    expect(first.fundingAddress).not.toBe(second.fundingAddress);
    expect(first.ownerId).toBe(second.ownerId);
    expect(first.ownerId).not.toContain(owner);
    const tokenHash = (await runtime.deps.store.getAccount(first.accountId))!.tokenHash;
    expect(tokenHash).not.toBe(first.accountToken);
    expect((await accounts(request("/api/owner/accounts", second.accountToken))).status).toBe(403);
    expect((await grant(request("/api/owner/accounts", agent, { accountId: first.accountId, confirmation: "CONFIRM", requestId: "a7100000-0000-4000-8000-000000000070" }))).status).toBe(403);
    const grantInput = { accountId: first.accountId, confirmation: "CONFIRM", requestId: "a7100000-0000-4000-8000-000000000070" };
    expect((await grant(request("/api/owner/accounts", owner, { ...grantInput, confirmation: "" }))).status).toBe(400);
    expect((await grant(request("/api/owner/accounts", owner, grantInput))).status).toBe(200);
    expect((await grant(request("/api/owner/accounts", owner, grantInput))).status).toBe(400);
    expect((await one.callTool({ name: "pay", arguments: { amountUsdcCents: 5, idempotencyKey: "comet-pay" } })).isError).not.toBe(true);
    for (const name of ["pay", "save", "strategize"]) {
      expect((await two.callTool({ name, arguments: { ...(name === "strategize" ? {} : { amountUsdcCents: name === "pay" ? 5 : 100 }), idempotencyKey: `luna-${name}` } })).isError).toBe(true);
    }
    expect((await two.callTool({ name: "statement", arguments: { accountId: first.accountId } })).isError).toBe(true);
    const ownStatement = body(await two.callTool({ name: "statement", arguments: {} }));
    expect(ownStatement.name).toBe("luna.agents.unflat.eth");
    expect(ownStatement.events.some((event: { action: string }) => event.action === "usdc.transfer")).toBe(false);
    for (const name of ["pay", "save", "statement", "request_mandate", "strategize"]) {
      const args = name === "request_mandate" ? { purpose: "must refuse" } : name === "statement" ? {} : { ...(name === "strategize" ? {} : { amountUsdcCents: name === "pay" ? 5 : 100 }), idempotencyKey: `enrollment-${name}` };
      expect((await enrollment.callTool({ name, arguments: args })).isError).toBe(true);
    }
    const listed = await (await accounts(request("/api/owner/accounts", owner))).json();
    expect(listed.accounts.find((a: { id: string }) => a.id === second.accountId)).toMatchObject({ fundingAddress: second.fundingAddress, balance: { amountUsdcCents: expect.any(Number) } });
    expect(JSON.stringify(listed)).not.toContain(first.accountToken);
    expect(JSON.stringify(listed)).not.toContain(tokenHash);
    expect((await GET(request("/api/mcp", `unflat_account_${"0".repeat(64)}`))).status).toBe(403);
    const foreignOrigin = request("/api/mcp", first.accountToken);
    foreignOrigin.headers.set("origin", "https://attacker.example");
    expect((await GET(foreignOrigin)).status).toBe(403);
    const transfer = vi.spyOn((runtime.deps as Dependencies).wallet, "transferUsdc");
    expect((await grant(request("/api/owner/accounts", owner, { ...grantInput, accountId: second.accountId, requestId: "a7100000-0000-4000-8000-000000000071" }))).status).toBe(200);
    for (const client of [one, two]) {
      expect((await client.callTool({ name: "pay", arguments: { amountUsdcCents: 5, idempotencyKey: "shared-key" } })).isError).not.toBe(true);
    }
    expect(transfer.mock.calls[0][0].idempotencyKey).not.toBe(transfer.mock.calls[1][0].idempotencyKey);
    vi.stubEnv("VERCEL", "1");
    expect((await GET(request("/api/mcp", first.accountToken))).status).toBe(403);
    expect((await accounts(request("/api/owner/accounts", owner))).status).toBe(403);
  } finally { await Promise.all([enrollment.close(), one.close(), two.close()]); }
});

it("denial cannot be turned into approval by a replay", async () => {
  const row = { id: "a7100000-0000-4000-8000-000000000099", agentId: persistentAgentId,
    principal: "denial-fixture", purpose: "Denied request", createdAt: new Date().toISOString(), status: "pending" as const };
  await runtime.deps.store.requestApproval(row);
  expect((await approve(request("/api/owner/approvals", owner, { id: row.id, action: "deny" }))).status).toBe(200);
  expect((await approve(request("/api/owner/approvals", owner, { id: row.id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(400);
});

it("owner-only recall and transfer require CONFIRM, fresh mandate and price validation; agents cannot invoke them", async () => {
  const enrollment = await connect();
  const created = body(await enrollment.callTool({ name: "get_account", arguments: { name: "owner-recovery", owner_email: "owner@example.com" } }));
  const client = await connect(created.accountToken);
  const input = { accountId: created.accountId, action: "earn.recall", confirmation: "CONFIRM",
    requestId: "a7100000-0000-4000-8000-000000000080", sharesRaw: "1000000000000000000",
    vaultAddress: runtime.deps.vaultAllowlist[0].address };
  try {
    for (const token of [agent, created.accountToken]) {
      expect((await recover(request("/api/owner/recovery", token, input))).status).toBe(403);
    }
    expect((await client.callTool({ name: "earn.recall", arguments: {} })).isError).toBe(true);
    expect((await client.callTool({ name: "owner.transfer", arguments: {} })).isError).toBe(true);
    const wallet = (runtime.deps as Dependencies).wallet;
    const redeem = vi.spyOn(wallet, "redeemDirectVault");
    const transfer = vi.spyOn(wallet, "transferUsdc");
    expect((await recover(request("/api/owner/recovery", owner, { ...input, confirmation: "" }))).status).toBe(400);
    expect((await recover(request("/api/owner/recovery", owner, input))).status).toBe(400);
    expect(redeem).not.toHaveBeenCalled();
    expect((await grant(request("/api/owner/accounts", owner, { accountId: created.accountId,
      requestId: "a7100000-0000-4000-8000-000000000081", confirmation: "CONFIRM" }))).status).toBe(200);
    const success = await recover(request("/api/owner/recovery", owner, { ...input, requestId: "a7100000-0000-4000-8000-000000000082" }));
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({ assetsReceivedRaw: "1000000", sharesRedeemedRaw: input.sharesRaw });
    expect(redeem).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: created.fundingAddress }));
    const send = { accountId: created.accountId, action: "owner.transfer", amountUsdcCents: 100,
      recipient: `0x${"9".repeat(40)}`, confirmation: "CONFIRM", requestId: "a7100000-0000-4000-8000-000000000083" };
    expect((await recover(request("/api/owner/recovery", owner, send))).status).toBe(200);
    expect((await recover(request("/api/owner/recovery", owner, send))).status).toBe(200);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect((await runtime.deps.store.getMandate(created.accountId))!.spentUsdcCents).toBe(100);
    const events = await runtime.deps.store.listEvents(created.accountId);
    expect(events.some(e => e.action === "earn.recall" && e.status === "completed")).toBe(true);
    expect(events.some(e => e.action === "owner.transfer" && e.status === "completed")).toBe(true);
    vi.spyOn(runtime.deps.aiMorgan, "strategize").mockResolvedValueOnce({ id: "bad-price", summary: "", idleFundsUsdcCents: 0, advisoryVaultIds: [], priceValidation: { allPassed: false, quotedUsdcCents: 0, checks: [{ name: "test-price", passed: false, reason: "Test refusal" }] } });
    expect((await recover(request("/api/owner/recovery", owner, { ...input, requestId: "a7100000-0000-4000-8000-000000000084" }))).status).toBe(400);
    expect(redeem).toHaveBeenCalledTimes(1);
    (runtime.deps.clock as FakeClock).advance(120_001);
    expect((await recover(request("/api/owner/recovery", owner, { ...input, requestId: "a7100000-0000-4000-8000-000000000085" }))).status).toBe(400);
    expect(redeem).toHaveBeenCalledTimes(1);
    vi.stubEnv("VERCEL", "1");
    expect((await recover(request("/api/owner/recovery", owner, input))).status).toBe(403);
  } finally { await Promise.all([enrollment.close(), client.close()]); }
});
