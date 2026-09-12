import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { agentServer } from "@/mcp/tools";
import { AgentService } from "@/mcp/service";
import { runtime as configured } from "@/server/runtime";
import { requireRole } from "@/server/role-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let principal: string;
  try { principal = requireRole(request, "agent"); }
  catch { return Response.json({ error: "Forbidden", detail: "Valid agent token required; MCP is disabled on Vercel." }, { status: 403 }); }
  const service = new AgentService(configured, principal);
  const server = agentServer((name, input) => {
    switch (name) {
      case "get_account": return service.getAccount();
      case "request_mandate": return service.requestMandate(input.purpose as string);
      case "pay": return service.pay(input.idempotencyKey as string);
      case "strategize": return service.strategize(input.idempotencyKey as string);
      case "save": return service.save(input.idempotencyKey as string);
      case "statement": return service.statement();
    }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch {
    return Response.json({ error: "MCP request failed", detail: "Inspect the owner statement before retrying an action." }, { status: 500 });
  } finally { await server.close(); }
}
export async function GET(request: Request) {
  try { requireRole(request, "agent"); } catch { return Response.json({ error: "Forbidden", detail: "Agent token required." }, { status: 403 }); }
  return Response.json({ error: "Method not allowed", detail: "Use Streamable HTTP POST; no SSE subscription." }, { status: 405, headers: { Allow: "POST" } });
}
