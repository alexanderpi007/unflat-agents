import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { agentServer } from "@/mcp/tools";
import { AgentService } from "@/mcp/service";
import { runtime as configured } from "@/server/runtime";
import { authenticateAgent } from "@/server/agent-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let accountId: string | undefined;
  try { accountId = await authenticateAgent(request, configured.deps.store); }
  catch { return Response.json({ error: "Forbidden", detail: "Valid agent token required; MCP is disabled on Vercel." }, { status: 403 }); }
  const service = new AgentService(configured, accountId);
  const server = agentServer((name, input) => {
    switch (name) {
      case "get_account": return service.getAccount(input.name as string | undefined, input.owner_email as string | undefined);
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
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json({ error: "MCP request failed", detail: "Inspect the owner statement before retrying an action." }, { status: 500 });
  } finally { await server.close(); }
}
export async function GET(request: Request) {
  try { await authenticateAgent(request, configured.deps.store); } catch { return Response.json({ error: "Forbidden", detail: "Agent token required." }, { status: 403 }); }
  return Response.json({ error: "Method not allowed", detail: "Use Streamable HTTP POST; no SSE subscription." }, { status: 405, headers: { Allow: "POST" } });
}
