import { RefusalError } from "@/core/errors";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export const instructions = [
  "Open an account anonymously with get_account({name, owner_email}); ask the owner for their email if unknown, never invent it. Enrollment is rate-limited; no shared token is needed.",
  "Store account_token ONCE, privately; pass the account_token you received from get_account as an optional argument on any tool. Successful get_account binds the same MCP session; then omit the token. New sessions need the saved token, never re-enrollment. Bearer and ?token= still work; credentials must agree. Never share/log tokens or session IDs. Give only funding_address to the owner.",
  "Call request_mandate, show approval_url to the owner, and poll get_account every 5 seconds until mandate.allowed is true. The owner alone approves with CONFIRM; amounts are USDC cents and budget_left is not wallet balance.",
  "Money is real on Base mainnet unless money_mode says mock. Pay/save require a valid mandate; expiry REFUSED is expected, not a failure: stop, do not retry. Never resubmit a payment with the same idempotency_key; never use a new key to retry an uncertain payment either—inspect statement with the owner.",
  "Standard job: open account → funding address to owner → funded wallet → request mandate and wait for approval → pay 5 → save 100 → wait 120 s → pay 5 once → report refusal, budget_left and statement. Follow next_step; if chain expiry is later, poll get_account until refused before that last pay.",
].join("\n");

export function result(data: Record<string, unknown>, isError = false) {
  return { isError, structuredContent: data, content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
export function failure(error: unknown) {
  const reason = error instanceof Error && error.message.startsWith("REFUSED") ? error.message : "Tool did not complete. Inspect the statement with the owner; do not resubmit a payment.";
  const expired = error instanceof RefusalError && reason.includes("mandate expired or absent: Arkiv returned no matching unexpired entity");
  return result({ status: expired ? "REFUSED" : "ERROR", reason, expected: expired,
    ...(error instanceof RefusalError ? { mandate: error.decision, budget_left: error.decision.remainingUsdcCents } : {}),
    next_step: expired ? "mandate expired — stop; report refusal, budget_left and statement"
      : reason.includes("use your account_token") ? "pass the account_token you received from get_account as an argument, Bearer header or ?token=; initialize a new session and use the saved token after a disconnect, not enrollment"
      : "stop; inspect the reason and ask the owner before any further action", retryable: false }, !expired);
}
export function success(name: string, value: unknown) {
  const data = value as Record<string, unknown>;
  // The stdio bridge forwards the HTTP protocol unchanged, including terminal refusals.
  if (typeof data.next_step === "string") return result(data, data.status === "ERROR");
  const mandate = (data.mandate ?? data.decision) as { allowed?: boolean; remainingUsdcCents?: number; reason?: string } | undefined;
  let next = "read statement and report the decisions and proof links";
  if (name === "get_account") next = data.accountToken ? `store account_token privately; ${data.session_bound ? "this MCP session is bound, so later tools need no repeated token" : "pass account_token as an argument on later tools"}; give funding_address to the owner and wait for Base USDC + gas funding before request_mandate`
    : data.status === "failed" ? "stop; provisioning incomplete—do not fund; ask the owner to inspect"
    : mandate?.allowed ? "budget active; pay 5 cents then save 100 cents with different fresh idempotency_key values"
    : data.requestStatus === "pending" ? "wait for owner approval; poll get_account every 5 seconds"
    : data.requestStatus === "denied" ? "owner denied — stop"
    : mandate?.reason?.includes("mandate expired or absent") ? "mandate expired — stop; read statement"
    : "request_mandate after the owner has funded the wallet";
  if (data.status === "failed") next = "stop; provisioning incomplete—save account_token privately if supplied, do not fund, ask the owner to inspect";
  if (name === "request_mandate") next = data.status === "active" ? `budget active; pay or save before expiry; owner request: ${data.approval_url}`
    : `wait for owner approval; show approval_url ${data.approval_url} to the owner, then poll get_account every 5 seconds until mandate.allowed is true`;
  if (name === "pay") next = "payment complete; do not resubmit; save 100 cents with a fresh idempotency_key while the mandate is valid";
  if (name === "save") next = "saving complete; wait 120 s, poll get_account until expiry, then pay 5 cents once with a fresh idempotency_key to prove REFUSED; do not retry the refused call";
  if (name === "strategize") next = "advice is advisory; save 100 cents only while the mandate is valid";
  return result({ ...data, ...(data.accountToken ? { account_token: data.accountToken } : {}),
    ...(data.fundingAddress ? { funding_address: data.fundingAddress } : {}),
    ...(data.moneyMode ? { money_mode: data.moneyMode } : {}),
    ...(mandate?.remainingUsdcCents !== undefined ? { budget_left: mandate.remainingUsdcCents } : {}), next_step: next });
}

// SDK schema/unknown-tool errors occur before our handler; normalize without echoing input values.
export function structuredErrors(transport: Transport) {
  const send = transport.send.bind(transport);
  transport.send = (message, options) => {
    if ("result" in message && message.result && typeof message.result === "object" && "isError" in message.result
      && message.result.isError && !("structuredContent" in message.result)) {
      return send({ ...message, result: result({ status: "ERROR", reason: "Invalid tool or arguments. Read tools/list for the exact schema.", next_step: "correct the request using tools/list; do not resubmit a payment", retryable: false }, true) }, options);
    }
    return send(message, options);
  };
}
