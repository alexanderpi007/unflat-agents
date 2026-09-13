import type { RequestInfo } from "@modelcontextprotocol/sdk/types.js";
import type { GatewayRuntime } from "@/server/runtime";
import { authenticateAgent } from "@/server/agent-auth";
import { enrollmentIpHash } from "@/server/enrollment-ip";
import type { AgentTool } from "./tools";
import { AgentService } from "./service";

// Only account identity and its credential fingerprint survive a request, never a raw token.
export class AccountSession {
  private bound?: { accountId: string; tokenHash: string };
  private busy = false;
  constructor(private readonly runtime: GatewayRuntime, readonly origin: string, private readonly persistent = false) {}

  assertAccount(accountId?: string) {
    if (accountId && this.bound && accountId !== this.bound.accountId) throw new Error("REFUSED — account credentials conflict with this MCP session. Open a new session for another account.");
  }

  async call(name: AgentTool, input: Record<string, unknown>, info?: RequestInfo) {
    if (this.busy) throw new Error("REFUSED — another tool is still running in this session. Inspect get_account and statement after it completes; do not resubmit a payment.");
    this.busy = true;
    try {
      if (!info?.url) throw new Error("REFUSED — HTTP request context required.");
      const headers = new Headers();
      for (const [key, value] of Object.entries(info.headers)) {
        for (const part of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(key, part);
      }
      const request = new Request(info.url, { headers });
      let explicit: string | undefined;
      try { explicit = await authenticateAgent(request, this.runtime.deps.store, input.account_token as string | undefined); }
      catch { throw new Error("REFUSED — invalid or conflicting account credentials; pass the account_token you received from get_account. No action was taken."); }
      this.assertAccount(explicit);
      if (this.bound) {
        const account = await this.runtime.deps.store.getAccount(this.bound.accountId);
        if (!account || account.tokenHash !== this.bound.tokenHash) throw new Error("REFUSED — session account credential is no longer valid. Reconnect with a valid account_token.");
      }
      const accountId = explicit ?? this.bound?.accountId;
      if (!accountId && name !== "get_account") throw new Error("REFUSED — use your account_token: pass the account_token you received from get_account as an argument, Bearer header or ?token=. No account is bound to this session.");
      const service = new AgentService(this.runtime, accountId, enrollmentIpHash(request), this.origin);
      // Credentials are consumed here, never forwarded to the gateway, adapters or statement.
      switch (name) {
        case "get_account": {
          const result = await service.getAccount(input.name as string | undefined, input.owner_email as string | undefined, input.chain as string | undefined);
          if (result.status === "ready") {
            const account = await this.runtime.deps.store.getAccount(result.accountId);
            if (!account) throw new Error("REFUSED — account unavailable; inspect provisioning before funding.");
            this.assertAccount(account.id);
            this.bound = { accountId: account.id, tokenHash: account.tokenHash };
          }
          return { ...result, session_bound: this.persistent && Boolean(this.bound) };
        }
        case "request_mandate": return await service.requestMandate(input.purpose as string);
        case "pay": return await service.pay(input.idempotencyKey as string);
        case "strategize": return await service.strategize(input.idempotencyKey as string);
        case "save": return await service.save(input.idempotencyKey as string);
        case "statement": return await service.statement();
      }
    } finally { this.busy = false; }
  }
}
