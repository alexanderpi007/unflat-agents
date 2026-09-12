import { afterEach, expect, it, vi } from "vitest";
import { isLocalRequest, requireLocalMutation } from "./local-only";
import { POST } from "@/app/api/demo/route";

afterEach(() => vi.unstubAllEnvs());
const request = (url: string, origin = new URL(url).origin, host = new URL(url).host) => new Request(url, {
  method: "POST", headers: { host, origin, "content-type": "application/json" },
  body: JSON.stringify({ mode: "live", runId: "a7100000-0000-4000-8000-000000000002", confirmation: "CONFIRM" }),
});

it("allows only matching loopback host + same origin, never forwarded hosts", () => {
  vi.stubEnv("VERCEL", "");
  expect(() => requireLocalMutation(request("http://localhost:3000/api/demo"))).not.toThrow();
  for (const req of [request("https://unflat-agents.vercel.app/api/demo"),
    request("http://localhost:3000/api/demo", "https://evil.example"),
    request("http://localhost.evil.example/api/demo"),
    request("http://localhost:3000/api/demo", "http://localhost:3000", "evil.example")]) {
    expect(() => requireLocalMutation(req)).toThrow();
  }
  const forwarded = request("http://localhost:3000/api/demo"); forwarded.headers.set("x-forwarded-host", "evil.example");
  expect(isLocalRequest(forwarded)).toBe(false);
  forwarded.headers.set("x-forwarded-host", "localhost:3000");
  expect(isLocalRequest(forwarded)).toBe(true);
});

it("Vercel rejects LIVE even with spoofed localhost and CONFIRM", async () => {
  vi.stubEnv("VERCEL", "1");
  const response = await POST(request("http://localhost:3000/api/demo"));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: "LIVE execution forbidden.", detail: expect.stringContaining("localhost-only") });
});

it("missing typed confirmation is rejected before adapters are called", async () => {
  vi.stubEnv("VERCEL", "");
  const req = request("http://localhost:3000/api/demo");
  const response = await POST(new Request(req, { body: JSON.stringify({ mode: "live", runId: "a7100000-0000-4000-8000-000000000002" }) }));
  expect(response.status).toBe(400);
});
