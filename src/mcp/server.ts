import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const gatewayUrl = process.env.UNFLAT_GATEWAY_URL ?? "http://localhost:3000";

async function call(path: string, method: "GET" | "POST", body?: unknown) {
  const response = await fetch(`${gatewayUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(String(result.error ?? `Gateway returned HTTP ${response.status}.`));
  return result;
}

const server = new McpServer({ name: "unflat-agents", version: "0.1.0" });

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

server.registerTool(
  "create_agent",
  {
    description: "Create a Privy-backed agent wallet and ENSv2 identity.",
    inputSchema: { displayName: z.string().min(1).max(64) },
  },
  async ({ displayName }) => result(await call("/api/agents", "POST", { displayName })),
);

server.registerTool(
  "grant_mandate",
  {
    description: "Grant an expiring spending mandate held in the unflat gateway store.",
    inputSchema: {
      agentId: z.string().uuid(),
      ownerId: z.string().min(1),
      durationSeconds: z.number().int().positive(),
      maxPerActionUsdcCents: z.number().int().positive(),
      maxTotalUsdcCents: z.number().int().positive(),
    },
  },
  async (input) => result(await call("/api/mandates", "POST", input)),
);

server.registerTool(
  "pay_x402",
  {
    description: "Pay an x402 resource through the mandate and AIMorgan price-validation gate.",
    inputSchema: {
      agentId: z.string().uuid(),
      resource: z.string().url(),
      idempotencyKey: z.string().min(8),
    },
  },
  async (input) => result(await call("/api/actions/pay", "POST", input)),
);

server.registerTool(
  "strategize",
  {
    description: "Run AIMorgan dry strategize first, then the paid REST call through the gateway.",
    inputSchema: {
      agentId: z.string().uuid(),
      totalUsdcCents: z.number().int().positive(),
      idempotencyKey: z.string().min(8),
    },
  },
  async (input) => result(await call("/api/actions/strategize", "POST", input)),
);

server.registerTool(
  "sweep_idle",
  {
    description: "Sweep idle USDC using a server-stored validated strategy and unflat vault allowlist.",
    inputSchema: {
      agentId: z.string().uuid(),
      strategyId: z.string().min(1),
      amountUsdcCents: z.number().int().positive(),
      idempotencyKey: z.string().min(8),
    },
  },
  async (input) => result(await call("/api/actions/sweep", "POST", input)),
);

server.registerTool(
  "get_agent_statement",
  {
    description: "Read agent state and human-readable mandate decisions from the gateway.",
    inputSchema: { agentId: z.string().uuid() },
    annotations: { readOnlyHint: true },
  },
  async ({ agentId }) => result(await call(`/api/agents/${agentId}`, "GET")),
);

await server.connect(new StdioServerTransport());

