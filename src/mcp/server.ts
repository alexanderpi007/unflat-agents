import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { agentServer } from "./tools";

const token = process.env.MCP_AGENT_TOKEN;
if (!token || token.length < 32) throw new Error("MCP_AGENT_TOKEN is required (at least 32 characters).");
const url = new URL("/api/mcp", process.env.UNFLAT_GATEWAY_URL ?? "http://localhost:3000");
if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Remote gateways require HTTPS.");
}
const remote = new Client({ name: "unflat-stdio-bridge", version: "0.2.0" });
await remote.connect(new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" }, redirect: "error" },
}));
const server = agentServer(async (name, input) => {
  const result = await remote.callTool({ name, arguments: input }, undefined, { timeout: 180_000 });
  const text = (result.content as { type: string; text?: string }[]).find(c => c.type === "text")?.text;
  if (result.isError) throw new Error(text ?? "Gateway refused the tool.");
  return JSON.parse(text ?? "null");
});
await server.connect(new StdioServerTransport());
server.server.onclose = () => { void remote.close(); };
