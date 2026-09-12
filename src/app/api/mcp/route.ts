import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { agentServer } from "@/mcp/tools";
import { AgentService } from "@/mcp/service";
import { runtime as configured } from "@/server/runtime";
import { authenticateAgent } from "@/server/agent-auth";
import { enrollmentIpHash } from "@/server/enrollment-ip";
import { structuredErrors } from "@/mcp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let accountId: string | undefined;
  try { accountId = await authenticateAgent(request, configured.deps.store); }
  catch { return Response.json({ error: "Forbidden", detail: "Use your account_token, not an owner/shared token. Omit Authorization only for new enrollment. MCP is disabled on Vercel.", next_step: "correct the account credential; never share a token URL" }, { status: 403, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
  let origin: string;
  try {
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const url = new URL(`${/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https"}://${host}`);
    if (url.host !== host || url.username || url.password) throw new Error("Invalid host");
    origin = url.origin;
  } catch { return Response.json({ error: "Invalid host", detail: "Use the gateway's HTTPS URL.", next_step: "correct the endpoint URL" }, { status: 400 }); }
  const service = new AgentService(configured, accountId, enrollmentIpHash(request), origin);
  const server = agentServer((name, input) => {
    if (!accountId && name !== "get_account") throw new Error("REFUSED — use your account_token. Only get_account enrollment is anonymous; send Authorization: Bearer <account_token> or ?token=<account_token> for this tool.");
    switch (name) {
      case "get_account": return service.getAccount(input.name as string | undefined, input.owner_email as string | undefined);
      case "request_mandate": return service.requestMandate(input.purpose as string);
      case "pay": return service.pay(input.idempotencyKey as string);
      case "strategize": return service.strategize(input.idempotencyKey as string);
      case "save": return service.save(input.idempotencyKey as string);
      case "statement": return service.statement();
    }
  }, configured.health.adapters.privy.mode);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  structuredErrors(transport);
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return Response.json({ error: "MCP request failed", detail: "Inspect the owner statement before retrying an action.", next_step: "stop; inspect statement with the owner" }, { status: 500 });
  } finally { await server.close(); }
}
export async function GET(request: Request) {
  try { await authenticateAgent(request, configured.deps.store); } catch { return Response.json({ error: "Forbidden", detail: "Agent token required." }, { status: 403 }); }
  return Response.json({ error: "Method not allowed", detail: "Use Streamable HTTP POST; no SSE subscription." }, { status: 405, headers: { Allow: "POST" } });
}
