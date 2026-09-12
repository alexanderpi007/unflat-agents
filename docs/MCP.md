# unflat agent tools

Local gateway, optionally through HTTPS ngrok: `POST /api/mcp`, **Streamable HTTP** with `Authorization: Bearer <MCP_AGENT_TOKEN>`. No public Vercel endpoint. Stdio `npm run mcp` bridges to the same authenticated HTTP server. [Connection and owner approval instructions](QUICKSTART-AGENT.md).

Exactly six tools are exposed. All inputs reject additional fields. No caller-supplied wallet/agent ID. `grant_mandate` is owner-only REST, never an MCP tool. Read/request operations need an agent token, but no active mandate. Pay/advice/save additionally require an owner-approved request bound to the current mandate and the gateway’s fresh authorization checks.

Examples below are illustrative shapes, not transaction proofs. Each MCP response contains a `content` text block with JSON; tool failures set `isError: true` and include a readable reason. Financial amounts are integer USDC cents.

| Tool | Example input | Output / permission |
| --- | --- | --- |
| `get_account` | `{}` | Name, wallet, USDC balance, fresh mandate decision, request status, actual money mode. Read without active permission. |
| `request_mandate` | `{"purpose":"Send five cents and save one dollar."}` | `{"requestId":"<uuid>","status":"pending","reason":"Waiting for the owner…"}`. No authorization granted. Existing pending request is reused. |
| `pay` | `{"amountUsdcCents":5,"idempotencyKey":"take-001-pay"}` | Transaction hash / BaseScan link from `transferUsdc`. Recipient is configured by owner; amount fixed at 5 cents. |
| `strategize` | `{"idempotencyKey":"take-001-advice"}` | Server-stored strategy ID, recommendations and price-validation result. Dry call before fee-waived call; active mandate required. |
| `save` | `{"amountUsdcCents":100,"idempotencyKey":"take-001-save"}` | Deposit hash / BaseScan link and receipt-backed shares. Runs strategy first, then gateway sweep. Amount fixed at 100 cents, owner-allowlisted vault only. |
| `statement` | `{}` | Name, fresh mandate decision and this account’s current-run event list; available after expiry. No commitment opening, owner token or Swarm reference. |

`get_account` example (mock example, balance is not the budget):

```json
{"name":"atlas.agents.unflat.eth","wallet":"0x…","balance":{"rawAmount":"2000000"},"mandate":{"allowed":false,"reason":"REFUSED — no mandate exists."},"requestStatus":"pending","moneyMode":"mock"}
```

Successful `pay` returns `{"transfer":{"transactionHash":"0x…","network":"eip155:8453","source":"privy-live","explorerUrl":"https://basescan.org/tx/0x…"},"decision":{"allowed":true,"reason":"APPROVED…"}}` (decision also includes checked time and remaining budget).

`save` returns `{vault, preflight, deposit, decision}`: approval proof is at `deposit.approval.transactionHash`, deposit proof at `deposit.deposit.transactionHash` / `deposit.deposit.explorerUrl`, and shares at `deposit.sharesReceivedRaw`, `deposit.sharesReceived`, `deposit.shareDecimals`. `preflight` contains the independently checked asset/balance/simulation evidence. Unavailable formatted shares are explicitly marked, never fabricated.

`strategize` returns a strategy, for example `{"id":"<strategy-id>","summary":"<advisory text>","idleFundsUsdcCents":100,"advisoryVaultIds":[],"priceValidation":{"allPassed":true},"aimorganFeeMode":"waived"}` (price validation can include further checks). The gateway never accepts an arbitrary client-supplied strategy. After expiry a financial tool returns:

```json
{"isError":true,"content":[{"type":"text","text":"REFUSED — mandate expired or absent: Arkiv returned no matching unexpired entity…"}]}
```

`statement` example event:

```json
{"name":"atlas.agents.unflat.eth","mandate":{"allowed":false,"reason":"REFUSED — mandate expired or absent…"},"events":[{"action":"usdc.transfer","status":"refused","amountUsdcCents":5,"at":"<ISO time>","reason":"REFUSED — mandate expired or absent…"}]}
```

## Owner boundary

`GET /api/owner/approvals` requires `OWNER_TOKEN` and lists pending requests from the local file store, with actual money mode and configured destination/vault. It does not return the agent credential hash. `POST` takes `{"id":"<request UUID>","action":"approve","confirmation":"CONFIRM"}` or `{"id":"<UUID>","action":"deny"}`. Approval creates the 120-second mandate with a $1.20 total/$1.00 per-action cap and fixed allowed actions. Duplicate approval or approval of a denied request fails. A failed/uncertain grant is not automatically retried.

Other owner mutation APIs, including `POST /api/mandates`, require the owner bearer token **and** `X-Unflat-Confirmation: CONFIRM`. Scripted LIVE uses its existing body `confirmation`. Localhost alone is never sufficient. An agent token fails all owner APIs; an owner token fails MCP. On Vercel both are disabled regardless of hostname or credentials. Invalid authentication returns JSON `{error, detail}` and HTTP 403. No CORS access is enabled; browser requests with a foreign Origin fail.

Approvals bind to the token-derived MCP account, not the dashboard account, while reusing the stored wallet. Changing the agent token creates a different account and requires a fresh approval. The authorization source remains the fresh Arkiv query; pending/approved queue state alone never authorizes a signature. No x402/Privy call occurs after mandate refusal. The public snapshot and browser-owned Swarm secret handling are unchanged.

## Tests

`src/mcp/http.test.ts` runs the actual SDK HTTP client against the route with mocked financial/Arkiv dependencies: request → wrong-role/missing-CONFIRM rejection → owner approval → pay → save → expiry → refusal. It checks the six-tool inventory, $0.15 remaining, statement access after expiry, and zero subsequent signing/advice calls. Role tests deny localhost bypasses and all Vercel execution. File-store tests cover duplicate requests and concurrent approval claims across route instances. No Base money is used by these tests.
