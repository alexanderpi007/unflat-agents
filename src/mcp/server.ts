import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { agentServer } from "./tools";
import { structuredErrors } from "./protocol";

const token = process.env.UNFLAT_ACCOUNT_TOKEN;
if (token && !/^unflat_account_[a-f0-9]{64}$/.test(token)) throw new Error("Invalid UNFLAT_ACCOUNT_TOKEN; omit it only for anonymous enrollment.");
const url = new URL("/api/mcp", process.env.UNFLAT_GATEWAY_URL ?? "http://localhost:3000");
if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Remote gateways require HTTPS.");
}
const remote = new Client({ name: "unflat-stdio-bridge", version: "0.2.0" });
await remote.connect(new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, redirect: "error" },
}));
const server = agentServer(async (name, input) => {
  const result = await remote.callTool({ name, arguments: input }, undefined, { timeout: 180_000 });
  const text = (result.content as { type: string; text?: string }[]).find(c => c.type === "text")?.text;
  if (result.structuredContent) return result.structuredContent;
  if (result.isError) throw new Error("REFUSED — inspect tools/list and use your account_token for account calls.");
  return JSON.parse(text ?? "null");
});
const transport = new StdioServerTransport();
structuredErrors(transport);
await server.connect(transport);
server.server.onclose = () => { void remote.close(); };
