import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { failure, instructions, success } from "./protocol";

export type AgentTool = "get_account" | "request_mandate" | "pay" | "strategize" | "save" | "statement";
export function agentServer(call: (name: AgentTool, input: Record<string, unknown>) => Promise<unknown>, moneyMode?: string) {
  const server = new McpServer({ name: "unflat-agents", version: "0.3.0" }, { instructions });
  const key = z.string().min(8).max(100).describe("Fresh unique idempotency_key for this action. Never resubmit a payment, with the same key or a new one. If uncertain, inspect statement with the owner.");
  const keys = { idempotency_key: key.optional(), idempotencyKey: key.optional().describe("Deprecated alias; use idempotency_key. Supply exactly one key field.") };
  const money = " Requires a valid mandate. After expiry the call returns REFUSED with a reason: this is the expected outcome, not an error—do not retry. Money is real (Base mainnet) unless money_mode says mock; never resubmit a payment with the same idempotency_key or change keys to retry an uncertain payment.";
  const register = (name: AgentTool, description: string, inputSchema: z.ZodRawShape, readOnly = false) => {
    server.registerTool(name, { title: name, description, inputSchema: z.object(inputSchema).strict(), outputSchema: z.object({ next_step: z.string() }).passthrough(),
      annotations: { readOnlyHint: readOnly, destructiveHint: name === "pay" || name === "save", openWorldHint: true } }, async input => {
      try {
        if (["pay", "save", "strategize"].includes(name)) {
          if ((!input.idempotency_key && !input.idempotencyKey) || (input.idempotency_key && input.idempotencyKey)) throw new Error("REFUSED — supply exactly one idempotency_key, 8–100 characters; do not resubmit a payment.");
          input.idempotencyKey = input.idempotency_key ?? input.idempotencyKey;
          delete input.idempotency_key;
        }
        const value = await call(name, input) as Record<string, unknown>;
        return success(name, { ...value, ...(moneyMode ? { money_mode: moneyMode } : {}) });
      } catch (error) {
        return failure(error);
      }
    });
  };
  register("get_account", "Opens an account without Authorization. Ask the owner for name and owner_email if missing; never invent their email. The response includes account_token, shown ONCE. Store it privately and send it as Authorization: Bearer on every later call—it identifies your account. ?token= is supported if headers are impossible; never share that secret URL. Also returns funding_address to give the owner: Base USDC and ETH for gas. Reconnect with the token and omit arguments to read balance, money_mode and mandate.allowed. Do not fund mock addresses. Five enrollments/IP/hour, ten total/hour; no automatic provisioning retry. Existing names, including Atlas, cannot be claimed.", {
    name: z.string().min(1).max(36).optional().describe("New ENS label, e.g. nova. Omit for account reads."),
    owner_email: z.string().email().max(254).optional().describe("Required for enrollment: the human owner's email identity, not the agent's email. Omit for account reads."),
  });
  register("request_mandate", "Asks the owner for a 2-minute budget ($1.20 cap). Show approval_url to the owner: /owner?request=<id> opens only this request and requires Privy email OTP login matching owner_email, then typed CONFIRM. Poll get_account until mandate.allowed is true before paying or saving. Returns pending; cannot grant permission. Requires your account_token.", { purpose: z.string().min(1).max(160) });
  register("pay", "Transfer exactly 5 USDC cents ($0.05) to the owner-configured recipient." + money, { amountUsdcCents: z.literal(5).describe("5 cents = $0.05 USDC"), ...keys });
  register("strategize", "Run dry then fee-waived AIMorgan advice under mandate. Advice is advisory only. Requires your account_token and a valid mandate; expiry means stop, not retry.", keys);
  register("save", "Save exactly 100 USDC cents ($1.00) to the owner-allowlisted vault, with dry/free advice, exact approval, simulation and deposit." + money, { amountUsdcCents: z.literal(100).describe("100 cents = $1.00 USDC"), ...keys });
  register("statement", "Readable record of every decision in this account's current run with on-chain proofs; mocked entries are labelled, not real proofs. Includes budget_left and refusal. Requires account_token, never an active mandate.", {}, true);
  return server;
}
