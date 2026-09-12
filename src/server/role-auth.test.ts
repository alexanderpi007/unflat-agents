import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ownerModeAvailable, requireOwnerMutation, requireRole } from "./role-auth";
import { POST as demo } from "@/app/api/demo/route";
import { POST as mandates } from "@/app/api/mandates/route";
import { POST as agents } from "@/app/api/agents/route";
import { POST as pay } from "@/app/api/actions/pay/route";
import { POST as transfer } from "@/app/api/actions/transfer/route";
import { POST as save } from "@/app/api/actions/sweep/route";
import { POST as advice } from "@/app/api/actions/strategize/route";
import { POST as mcp } from "@/app/api/mcp/route";
import { GET as approvals } from "@/app/api/owner/approvals/route";
const owner = "test-owner-token-not-a-secret-123456789";
const agent = "test-agent-token-not-a-secret-123456789";
function request(token?: string, host = "demo-example.ngrok-free.app", origin = `https://${host}`) {
  return new Request(`https://${host}/api/demo`, { method: "POST", headers: {
    host, origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), "content-type": "application/json",
  }, body: JSON.stringify({ mode: "live", confirmation: "CONFIRM", runId: "a7100000-0000-4000-8000-000000000003" }) });
}
beforeEach(() => { vi.stubEnv("VERCEL", ""); vi.stubEnv("OWNER_TOKEN", owner); vi.stubEnv("MCP_AGENT_TOKEN", agent); });
afterEach(() => vi.unstubAllEnvs());

it("remote owner is accepted, with strict separation from the agent role", () => {
  expect(requireRole(request(owner), "owner")).toMatch(/^[a-f0-9]{64}$/);
  expect(requireRole(request(agent), "agent")).toMatch(/^[a-f0-9]{64}$/);
  expect(() => requireRole(request(agent), "owner")).toThrow();
  expect(() => requireRole(request(owner), "agent")).toThrow();
  expect(() => requireRole(request(), "owner")).toThrow();
  expect(() => requireRole(request(owner, "demo-example.ngrok-free.app", "https://evil.example"), "owner")).toThrow();
  const req = request(owner);
  expect(() => requireOwnerMutation(req)).toThrow("CONFIRM");
  req.headers.set("x-unflat-confirmation", "CONFIRM");
  expect(() => requireOwnerMutation(req)).not.toThrow();
});

it("missing, weak or shared credentials fail closed", () => {
  for (const value of ["", "short", agent]) {
    vi.stubEnv("OWNER_TOKEN", value);
    expect(() => requireRole(request(agent), "agent")).toThrow();
  }
});

it("localhost and agent credentials cannot bypass owner-only signing routes", async () => {
  for (const route of [demo, mandates, agents, pay, transfer, save, advice]) {
    expect((await route(request(undefined, "localhost"))).status).toBe(403);
    expect((await route(request(agent))).status).toBe(403);
  }
  expect((await mcp(request(owner))).status).toBe(403);
  expect((await approvals(request(agent))).status).toBe(403);
});

it("Vercel disables owner mode, MCP, and every live mutation even with valid tokens", async () => {
  vi.stubEnv("VERCEL", "1");
  expect(ownerModeAvailable()).toBe(false);
  for (const route of [demo, mandates, agents, pay, transfer, save, advice]) {
    const req = request(owner, "localhost"); req.headers.set("x-unflat-confirmation", "CONFIRM");
    expect((await route(req)).status).toBe(403);
  }
  expect((await mcp(request(agent))).status).toBe(403);
  expect((await approvals(request(owner))).status).toBe(403);
});
