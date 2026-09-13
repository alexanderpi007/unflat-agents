import { randomBytes } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { GatewayRuntime } from "@/server/runtime";
import { authenticateAgent } from "@/server/agent-auth";
import { AccountSession } from "./account-session";
import { agentServer } from "./tools";
import { structuredErrors } from "./protocol";

type Session = { account: AccountSession; transport: WebStandardStreamableHTTPServerTransport;
  server: ReturnType<typeof agentServer>; expiresAt: number; active: number };
declare global { var unflatMcpSessionsV1: Map<string, Session> | undefined; }
const sessions = globalThis.unflatMcpSessionsV1 ??= new Map<string, Session>();
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const error = (status: number, detail: string) => Response.json({ error: "MCP request refused", detail, next_step: detail }, { status, headers });
const missingSession = () => error(404, "Session expired or unavailable. Initialize a new MCP session, then call get_account with your saved account_token; do not enroll again.");

function gatewayOrigin(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const url = new URL(`${/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https"}://${host}`);
  if (url.host !== host || url.username || url.password) throw new Error("Invalid host");
  return url.origin;
}

export async function handleMcp(request: Request, runtime: GatewayRuntime) {
  let explicit: string | undefined;
  try { explicit = await authenticateAgent(request, runtime.deps.store); }
  catch { return error(403, "Use your account_token, not an owner/shared token. Invalid header/query credentials cannot fall back to arguments or session binding. MCP is disabled on Vercel."); }
  let origin: string;
  try { origin = gatewayOrigin(request); } catch { return error(400, "Use the gateway's valid HTTPS URL."); }
  for (const [id, entry] of sessions) {
    if (entry.expiresAt <= Date.now() && !entry.active) { sessions.delete(id); await entry.server.close(); }
  }
  const id = request.headers.get("mcp-session-id");
  let entry = id ? sessions.get(id) : undefined;
  if (id !== null && (!entry || entry.expiresAt <= Date.now() || entry.account.origin !== origin)) return missingSession();
  try { entry?.account.assertAccount(explicit); } catch { return error(403, "Account credentials conflict with this MCP session. Open a new session for another account."); }
  if (request.method === "GET") return Response.json({ error: "Method not allowed", detail: "Use Streamable HTTP POST; no SSE subscription." }, { status: 405, headers: { ...headers, Allow: "POST, DELETE" } });
  if (request.method === "DELETE" && !entry) return missingSession();

  let body: unknown;
  if (request.method === "POST") {
    try { body = await request.json(); } catch { return error(400, "Invalid JSON request; read tools/list for the schema."); }
  }
  const initialize = body !== null && typeof body === "object" && "method" in body && body.method === "initialize";
  const persistent = Boolean(id) || initialize;
  let allocatedId: string | undefined;
  if (!entry) {
    if (initialize && sessions.size >= 256) return error(429, "MCP session limit reached. Close unused sessions and try later.");
    allocatedId = initialize ? randomBytes(32).toString("hex") : undefined;
    const account = new AccountSession(runtime, origin, persistent);
    const server = agentServer((name, input, info) => account.call(name, input, info), runtime.health.adapters.privy.mode);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true,
      sessionIdGenerator: allocatedId ? () => allocatedId! : undefined });
    structuredErrors(transport);
    entry = { account, server, transport, expiresAt: Date.now() + 3_600_000, active: 0 };
    // Reserve capacity before the asynchronous handshake. Only the server generates IDs.
    if (allocatedId) {
      sessions.set(allocatedId, entry);
      server.server.onclose = () => { sessions.delete(allocatedId!); };
    }
    try { await server.connect(transport); }
    catch { if (allocatedId) sessions.delete(allocatedId); await server.close(); return error(500, "MCP initialization failed; reconnect before any action."); }
  }
  entry.active++;
  try {
    const response = await entry.transport.handleRequest(request, { parsedBody: body });
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } catch { return error(500, "Inspect the owner statement before retrying any action."); }
  finally {
    entry.active--;
    if (!persistent || (allocatedId && !entry.transport.sessionId)) {
      if (allocatedId) sessions.delete(allocatedId);
      await entry.server.close();
    }
  }
}
