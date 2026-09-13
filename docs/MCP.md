# unflat MCP protocol
Endpoint: https://circus-thicken-plod.ngrok-free.dev/api/mcp (temporary local gateway tunnel, not Vercel).

Initialize and tools/list are anonymous. Initialization supplies five lines of instructions; tool descriptions carry the workflow. No enrollment/shared agent token exists. Ask the human for their actual owner email before opening a wallet—never invent one.

## Six tools

| Tool | Input | Result / next step |
| --- | --- | --- |
| get_account | {"name":"nova","owner_email":"owner@example.com"} without auth; {} with account token | One-time account_token, funding_address, ownership and money_mode. Give only the funding address to the owner; do not fund mock addresses. |
| request_mandate | {"purpose":"Pay five cents and save one dollar"} | Pending request and approval_url. Show that link to the owner; poll get_account every five seconds until mandate.allowed=true. |
| pay | {"amountUsdcCents":5,"idempotency_key":"unique-pay-001"} | Guarded 0.05 USDC transfer and proof; save next. |
| strategize | {"idempotency_key":"unique-advice-001"} | Dry then fee-waived advice under mandate; never a client-selected deposit vault. |
| save | {"amountUsdcCents":100,"idempotency_key":"unique-save-001"} | Guarded exact approval/deposit and receipt-backed shares; wait for expiry. |
| statement | {} | This account's current run, readable decisions, proof_url, fresh mandate and budget_left. Available after expiry. |

Every tool result has structuredContent and matching JSON text, including next_step. Discovery publishes outputSchema. An expired Arkiv mandate returns status=REFUSED, expected=true, retryable=false, budget_left and the gateway reason, with isError=false: this is the successful refusal scene. Other failures remain isError=true and give a next_step. Schema errors never echo supplied credential values.

Every tool, including get_account, accepts an optional `account_token` argument: pass the account_token you received from get_account. Bearer headers and /api/mcp?token=<account_token> also remain supported. If multiple credentials are supplied, all must agree; invalid credentials never fall back to a valid argument or session. Anonymous non-enrollment calls without a bound session say “use your account_token”. Token arguments are consumed by MCP authentication, never passed to gateway actions/adapters/statements or echoed in schema errors. They are still credentials: your MCP client/provider can see tool arguments, so do not publish transcripts or enable request-body logging. Approval URLs contain only a request UUID, never credentials. Next dev excludes MCP access logs; run ngrok with --inspect=false and disable upstream body/header logs.

## Optional Avalanche Fuji accounts

On the `avalanche` branch, add `chain: "avalanche-fuji"` to a **new** `get_account({name, owner_email})` enrollment. The default is `base`; existing accounts and tokens cannot switch chains. Responses identify the chain and funding asset. A Privy Ethereum wallet has the same EVM address on both networks, but each gateway account selects one network; balances and transactions are never combined across chains. Atlas and nova remain Base accounts.

Fuji supports `pay` only: 5 test USDC cents, AVAX gas, a fresh Arkiv check before Privy signing, and a Snowtrace proof. `save` and `strategize` return `REFUSED` with “not supported on this chain”; no advice payment, approval or deposit is made. After one payment, wait for expiry and attempt one more payment: expect `REFUSED` with 115 cents of unused test-USDC budget. No automatic retry. Owner CONFIRM and all account authentication rules still apply. The manual policy, funding instructions and limitations are in [AVALANCHE.md](AVALANCHE.md).

## Fixed-URL connectors and session binding

Initialize returns a cryptographically random `Mcp-Session-Id`. The MCP client carries that protocol header automatically; no manually configured Authorization header or URL change is required. After a successful get_account (new enrollment or authenticated existing-account read), `session_bound=true`: subsequent tools use that account without repeating the token. Binding establishes identity only—owner approval and fresh gateway mandate checks still apply to every financial action.

Sessions are in-memory, origin-scoped, expire one hour after initialization, and disappear on server restart or HTTP DELETE. At most 256 sessions exist concurrently; account enrollment retains its separate store-backed limits. Session IDs become account-access secrets after binding: never share or log them. Account credential fingerprints are rechecked against the store; sessions cannot switch accounts. Conflicting header/query/argument credentials fail closed. Tool calls in one session run one at a time; overlapping calls are refused, never automatically queued or retried.

Verified with the real SDK through the ngrok URL: initialize issued a session, tools/list exposed account_token on all six tools, and DELETE closed the session. That probe made no account or financial tool calls. The fixed-URL account workflow is covered by mock-client integration tests, not claimed as a Claude.ai UI run.

If a session expires, initialize again and call `get_account({account_token: savedToken})` without a name/email. This restores the existing account; never enroll again to reconnect. Clients that do not retain the protocol session header can send `account_token` on every tool call; such responses report `session_bound=false` on get_account. No-session POST compatibility remains.

Three connector examples (the variables below are values saved privately, not literal credentials):

```js
// Same session, after successful enrollment:
request_mandate({purpose: "Pay five cents and save one dollar"});
// A new connection, with the saved token, restores and binds the existing account:
get_account({account_token: savedToken});
// Without session retention, pass the token on each scoped call:
statement({account_token: savedToken});
```

Transport lifecycle follows the [MCP session specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management). This demo's session binding is application account authentication, not an OAuth implementation; keep the tunnel private to the demo audience.

The existing camelCase accountToken/fundingAddress response aliases and idempotencyKey input alias remain for compatibility. Use account_token, funding_address and idempotency_key in new clients. Do not resubmit payments under either the same key or a replacement key. For an uncertain outcome stop and inspect the statement with the owner; backend duplicate protection remains intact.

## Anonymous enrollment limits

Five provisioning claims per IP per rolling hour, plus ten total per gateway per hour. Both checks and name reservation run under the same persistent store lock; failures still consume a slot, duplicate names do not. A keyed hash of the final forwarded IP is stored, never a raw IP. Missing/invalid forwarding addresses share a conservative bucket. The global ceiling bounds cost even if proxy headers are forged. This is a single-process demo limiter, not a distributed abuse defense. Owner-authenticated operator provisioning is not anonymous enrollment.

## Owner approval and identity

approval_url opens /owner?request=<uuid>. The owner signs in through Privy email OTP, then reviews that single request and types CONFIRM to approve. The server verifies the Privy access token (signature, app audience, issuer and expiry), reads the user from Privy, and matches both verified owner_email and the stored Privy user ID. A URL, account token, client-supplied email or another Privy user cannot approve it. Owner mode lists only that logged-in user's accounts; foreign requests appear absent. Denial needs no CONFIRM and grants nothing. After approval: “Approved — your agent can act for 2 minutes”; approval status persists. The timer begins at grant, not at request.

OWNER_TOKEN remains a bank-operator API override only; it is never entered or displayed in the UI. It can manage legacy Atlas and all accounts. Raw operator mutation APIs and the scripted Atlas LIVE API retain their confirmation requirements. Human owners use scoped /api/owner/accounts, /api/owner/approvals and /api/owner/recovery with their Privy bearer token. Recovery requires ownership, CONFIRM and a fresh gateway mandate. Public Vercel refuses all these APIs and does not render Owner mode or /owner.

## Operator setup and clients

Configure Privy email login, embedded wallets, the current tunnel allowed origin, PRIVY_SESSION_SIGNER_ID matching PRIVY_AUTHORIZATION_PRIVATE_KEY, live adapters and OWNER_TOKEN. Restart Next after this store/runtime upgrade. Atlas is not migrated; see [ownership and recovery limits](OWNERSHIP.md).

Claude Code: `claude mcp add unflat --transport http https://circus-thicken-plod.ngrok-free.dev/api/mcp`. Claude.ai fixed-URL connectors can pass account_token as a tool argument, or rely on the session after get_account. Hermes uses the same Streamable HTTP URL under mcp_servers.unflat.url and can use the same argument/session flow. No reconnect is needed after enrollment; only after session expiry/restart, restore with the saved token. Stdio npm run mcp starts anonymously when UNFLAT_ACCOUNT_TOKEN is absent, and otherwise forwards that account credential; UNFLAT_GATEWAY_URL selects the gateway. No wallet or owner key belongs on the agent laptop.

Standard job: open → owner funds → request/show approval link → wait for approval → pay 5 → save 100 → wait 120 seconds (and poll actual Arkiv expiry) → pay 5 once → report REFUSED, 15 cents remaining and statement. Live amounts are unchanged; tests use mock money.

Ngrok's browser interstitial is upstream of Next: adding a header inside this application cannot bypass an interstitial that never reached it. On 13 September 2026 (Europe/Rome), anonymous Node fetch initialize returned HTTP 200 JSON without a bypass header, and the actual Claude Code `claude mcp get unflat-readonly-check` reported `Status: ✓ Connected` using only the HTTP URL. No account or action tool was called. Hermes is not installed here; its python-httpx User-Agent profile also returned HTTP 200 JSON, but that is not an end-to-end Hermes verification. Browsers may need to visit the interstitial once; a blocked API client must send ngrok-skip-browser-warning:true or use a non-interstitial tunnel.

Tests cover discovery-only onboarding, one-time token handoff, argument/header/query/session isolation, expired-session recovery, concurrent binding, persistent concurrent enrollment limits, email ownership, per-request approval/CONFIRM, expiry refusal, and zero financial signing after expiry.
