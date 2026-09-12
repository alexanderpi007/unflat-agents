import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FakeClock } from "@/core/clock";
import type { Dependencies } from "@/core/ports";
import { persistentAgentId } from "@/demo/dashboard-run";
import { runtime } from "@/server/runtime";
import { POST, GET } from "@/app/api/mcp/route";
import { POST as approve, GET as approvals } from "@/app/api/owner/approvals/route";

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
  vi.stubEnv("VERCEL", ""); vi.stubEnv("OWNER_TOKEN", owner); vi.stubEnv("MCP_AGENT_TOKEN", agent);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("fake HTTP client: request → remote owner CONFIRM → pay → save → expiry → refusal", async () => {
  await runtime.gateway.getOrCreateAgent(persistentAgentId, "Atlas");
  const client = new Client({ name: "fake-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(base + "/api/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${agent}` } },
    fetch: async (url, init) => {
      const req = new Request(url, init);
      return req.method === "POST" ? POST(req) : GET(req);
    },
  });
  await client.connect(transport);
  try {
    expect((await client.listTools()).tools.map(t => t.name).sort()).toEqual(["get_account", "pay", "request_mandate", "save", "statement", "strategize"]);
    const tool = (name: string, args = {}) => client.callTool({ name, arguments: args });
    expect((await tool("get_account")).isError).not.toBe(true);
    expect((await tool("statement")).isError).not.toBe(true);
    expect((await tool("grant_mandate")).isError).toBe(true);
    expect((await tool("request_mandate", { purpose: "Send five cents, save one dollar." })).isError).not.toBe(true);
    const pending = (await (await approvals(request("/api/owner/approvals", owner))).json()).pending;
    expect(pending).toHaveLength(1);
    expect(JSON.stringify(pending)).not.toContain("principal");
    const id = pending[0].id;
    expect((await tool("pay", { amountUsdcCents: 5, idempotencyKey: "before-approval" })).isError).toBe(true);
    expect((await approve(request("/api/owner/approvals", agent, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(403);
    expect((await approve(request("/api/owner/approvals", owner, { id, action: "approve" }))).status).toBe(400);
    expect((await approve(request("/api/owner/approvals", owner, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(200);
    expect((await approve(request("/api/owner/approvals", owner, { id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(400);
    expect((await tool("pay", { amountUsdcCents: 5, idempotencyKey: "approved-pay" })).isError).not.toBe(true);
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
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain("REFUSED");
    }
    for (const spy of [...signing, advice]) expect(spy).not.toHaveBeenCalled();
    const statement = await tool("statement");
    expect(statement.isError).not.toBe(true);
    expect(JSON.stringify(statement)).toContain("refused");
    expect(JSON.stringify(statement)).not.toContain(owner);
    expect(JSON.stringify(statement)).not.toContain(agent);
    expect((await tool("get_account")).isError).not.toBe(true);
  } finally { await client.close(); }
});

it("denial cannot be turned into approval by a replay", async () => {
  const row = { id: "a7100000-0000-4000-8000-000000000099", agentId: persistentAgentId,
    principal: "denial-fixture", purpose: "Denied request", createdAt: new Date().toISOString(), status: "pending" as const };
  await runtime.deps.store.requestApproval(row);
  expect((await approve(request("/api/owner/approvals", owner, { id: row.id, action: "deny" }))).status).toBe(200);
  expect((await approve(request("/api/owner/approvals", owner, { id: row.id, action: "approve", confirmation: "CONFIRM" }))).status).toBe(400);
});
