# unflat agent tools

Local gateway, optionally through HTTPS ngrok: `POST /api/mcp`, **Streamable HTTP**. Use `Authorization: Bearer <MCP_AGENT_TOKEN>` only to enroll with `get_account({name})`; reconnect with `Authorization: Bearer <accountToken>` for every later call. No public Vercel endpoint. Stdio `npm run mcp` bridges to the same authenticated HTTP server. [Connection and owner approval instructions](QUICKSTART-AGENT.md).

Exactly six tools are exposed. All inputs reject additional fields. No caller-supplied wallet/agent ID. `grant_mandate` is owner-only REST, never an MCP tool. Read/request operations need an agent token, but no active mandate. Pay/advice/save additionally require an owner-approved request bound to the current mandate and the gateway’s fresh authorization checks.

Examples below are illustrative shapes, not transaction proofs. Each MCP response contains a `content` text block with JSON; tool failures set `isError: true` and include a readable reason. Financial amounts are integer USDC cents.

| Tool | Example input | Output / permission |
| --- | --- | --- |
| `get_account` | `{"name":"nova"}` to enroll; `{}` with account token | Enrollment creates a wallet/name and returns a token once. Scoped reads return name, wallet/funding address, USDC balance (null if unavailable), fresh mandate decision, request status and money mode without an active mandate. |
| `request_mandate` | `{"purpose":"Send five cents and save one dollar."}` | `{"requestId":"<uuid>","status":"pending","reason":"Waiting for the owner…"}`. No authorization granted. Existing pending request is reused. |
| `pay` | `{"amountUsdcCents":5,"idempotencyKey":"take-001-pay"}` | Transaction hash / BaseScan link from `transferUsdc`. Recipient is configured by owner; amount fixed at 5 cents. |
| `strategize` | `{"idempotencyKey":"take-001-advice"}` | Server-stored strategy ID, recommendations and price-validation result. Dry call before fee-waived call; active mandate required. |
| `save` | `{"amountUsdcCents":100,"idempotencyKey":"take-001-save"}` | Deposit hash / BaseScan link and receipt-backed shares. Runs strategy first, then gateway sweep. Amount fixed at 100 cents, owner-allowlisted vault only. |
| `statement` | `{}` | Name, fresh mandate decision and this account’s current-run event list; available after expiry. No commitment opening, owner token or Swarm reference. |

`get_account({name})` enrollment example (placeholders, never publish an actual account token):

```json
{"accountId":"<uuid>","name":"nova.agents.unflat.eth","ownerId":"owner:<public-uuid>","status":"ready","accountToken":"<one-time-secret>","fundingAddress":"0x…","network":"eip155:8453","ensRegistrationTransaction":"0x…","moneyMode":"live","detail":"Save accountToken privately now…"}
```

Only a SHA-256 token hash is stored. Duplicate names and Atlas are refused; knowing a name never retrieves a credential or replaces a wallet. A scoped token cannot enroll another name or supply another account ID. A failed provisioning response still returns its token once, with `status: failed` and any partial funding address: stop, do not fund it, and ask the owner to inspect it. Lost enrollment responses have no automatic recovery. New live enrollment requires both ENS signers and Sepolia RPC; it registers address, owner, gateway and an initial zero mandate commitment, updated on grant.

Scoped `get_account` example (mock example, balance is not the budget):

```json
{"name":"nova.agents.unflat.eth","wallet":"0x…","fundingAddress":"0x…","balance":{"rawAmount":"2000000"},"mandate":{"allowed":false,"reason":"REFUSED — no mandate exists."},"requestStatus":"pending","moneyMode":"mock"}
```

Successful `pay` returns `{"transfer":{"transactionHash":"0x…","network":"eip155:8453","source":"privy-live","explorerUrl":"https://basescan.org/tx/0x…"},"decision":{"allowed":true,"reason":"APPROVED…"}}` (decision also includes checked time and remaining budget).

`save` returns `{vault, preflight, deposit, decision}`: approval proof is at `deposit.approval.transactionHash`, deposit proof at `deposit.deposit.transactionHash` / `deposit.deposit.explorerUrl`, and shares at `deposit.sharesReceivedRaw`, `deposit.sharesReceived`, `deposit.shareDecimals`. `preflight` contains the independently checked asset/balance/simulation evidence. Unavailable formatted shares are explicitly marked, never fabricated.

`strategize` returns a strategy, for example `{"id":"<strategy-id>","summary":"<advisory text>","idleFundsUsdcCents":100,"advisoryVaultIds":[],"priceValidation":{"allPassed":true},"aimorganFeeMode":"waived"}` (price validation can include further checks). The gateway never accepts an arbitrary client-supplied strategy. After expiry a financial tool returns:

```json
{"isError":true,"content":[{"type":"text","text":"REFUSED — mandate expired or absent: Arkiv returned no matching unexpired entity…"}]}
```

`statement` example event:

```json
{"name":"nova.agents.unflat.eth","mandate":{"allowed":false,"reason":"REFUSED — mandate expired or absent…"},"events":[{"action":"usdc.transfer","status":"refused","amountUsdcCents":5,"at":"<ISO time>","reason":"REFUSED — mandate expired or absent…"}]}
```

## Owner boundary

`GET /api/owner/approvals` requires `OWNER_TOKEN` and lists pending requests from the local file store, with actual money mode and configured destination/vault. It does not return the agent credential hash. `POST` takes `{"id":"<request UUID>","action":"approve","confirmation":"CONFIRM"}` or `{"id":"<UUID>","action":"deny"}`. Approval creates the 120-second mandate with a $1.20 total/$1.00 per-action cap and fixed allowed actions. Duplicate approval or approval of a denied request fails. A failed/uncertain grant is not automatically retried.

Other owner mutation APIs, including `POST /api/mandates`, require the owner bearer token **and** `X-Unflat-Confirmation: CONFIRM`. Scripted LIVE uses its existing body `confirmation`. Localhost alone is never sufficient. An agent token fails all owner APIs; an owner token fails MCP. On Vercel both are disabled regardless of hostname or credentials. Invalid authentication returns JSON `{error, detail}` and HTTP 403. No CORS access is enabled; browser requests with a foreign Origin fail.

`GET /api/owner/accounts` lists all accounts, names, balances, funding addresses and provisioning/mandate status, without credential hashes. `POST` takes `{"accountId":"<uuid>","requestId":"<fresh-uuid>","confirmation":"CONFIRM"}` and grants that specific ready account the same budget through the approval path. The owner can manage Atlas without replacing its wallet, name or history.

Approvals bind to the account ID and its credential hash. Each new account has a separate wallet, ENS name, statement and budget; it cannot borrow Atlas's approval. Rotating the enrollment token does not replace accounts or revoke account tokens. The authorization source remains the fresh Arkiv query; pending/approved queue state alone never authorizes a signature. No x402/Privy call occurs after mandate refusal. The public snapshot and browser-owned Swarm secret handling are unchanged.

## Tests

`src/mcp/http.test.ts` runs the actual SDK HTTP client against the route with mocked financial/Arkiv dependencies: request → wrong-role/missing-CONFIRM rejection → owner approval → pay → save → expiry → refusal. It checks the six-tool inventory, $0.15 remaining, statement access after expiry, and zero subsequent signing/advice calls. Role tests deny localhost bypasses and all Vercel execution. File-store tests cover duplicate requests and concurrent approval claims across route instances. No Base money is used by these tests.

Multi-account tests cover one-time enrollment, normalized name collisions, failed ENS provisioning without wallet replacement, hashed-token persistence, account isolation, Atlas preservation, per-account owner grants and outgoing idempotency-key separation. Browser tests verify separate funding addresses, unavailable balances and account-specific CONFIRM fields. Shared ENS signer writes are serialized until receipt confirmation to avoid nonce races between accounts; this coordination remains within the single gateway process.
