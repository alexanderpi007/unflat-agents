import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export type AgentTool = "get_account" | "request_mandate" | "pay" | "strategize" | "save" | "statement";
export function agentServer(call: (name: AgentTool, input: Record<string, unknown>) => Promise<unknown>) {
  const server = new McpServer({ name: "unflat-agents", version: "0.2.0" });
  const key = z.string().min(8).max(100).describe("Unique action key. Reuse only to recover the identical request; never retry uncertain transactions with a new key.");
  const register = (name: AgentTool, description: string, inputSchema: z.ZodRawShape, readOnly = false) => {
    server.registerTool(name, { description, inputSchema: z.object(inputSchema).strict(),
      annotations: { readOnlyHint: readOnly, destructiveHint: name === "pay" || name === "save", openWorldHint: true } }, async input => {
      try {
        const value = await call(name, input);
        return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
      } catch (error) {
        const message = error instanceof Error && error.message.startsWith("REFUSED") ? error.message : "Tool did not complete. Ask the owner to inspect the statement before retrying. No automatic retry.";
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    });
  };
  register("get_account", "Read account name, wallet, USDC balance and fresh mandate decision. Does not require active permission.", {}, true);
  register("request_mandate", "Ask the owner for a two-minute, 1.20 USDC cap mandate. Returns pending; cannot grant permission.", { purpose: z.string().min(1).max(160) });
  register("pay", "Transfer exactly 0.05 USDC to the owner-configured recipient, only with owner approval and a live gateway mandate.", { amountUsdcCents: z.literal(5), idempotencyKey: key });
  register("strategize", "Run dry then fee-waived AIMorgan advice under mandate. Require price validation before any signing.", { idempotencyKey: key });
  register("save", "Save exactly 1 USDC to the owner-allowlisted vault. Runs strategize first, then exact approval, simulation and deposit under fresh mandate checks.", { amountUsdcCents: z.literal(100), idempotencyKey: key });
  register("statement", "Read only this account's current-run decisions, including refusal after expiry. No active mandate required.", {}, true);
  return server;
}
