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

Account tools require Authorization: Bearer <account_token>. Clients unable to set headers may reconnect to /api/mcp?token=<account_token>. Header/query conflicts, empty/duplicate tokens and invalid credentials fail closed; an invalid credential never falls back to anonymous. Anonymous non-enrollment calls say “use your account_token”. Token URLs are secrets; never show them to the owner or publish/log them. Approval URLs contain only a request UUID, never a token. Next dev excludes MCP requests from access logs; disable ngrok inspection/access logs yourself (run ngrok with --inspect=false). Use headers when possible.

The existing camelCase accountToken/fundingAddress response aliases and idempotencyKey input alias remain for compatibility. Use account_token, funding_address and idempotency_key in new clients. Do not resubmit payments under either the same key or a replacement key. For an uncertain outcome stop and inspect the statement with the owner; backend duplicate protection remains intact.

## Anonymous enrollment limits

Five provisioning claims per IP per rolling hour, plus ten total per gateway per hour. Both checks and name reservation run under the same persistent store lock; failures still consume a slot, duplicate names do not. A keyed hash of the final forwarded IP is stored, never a raw IP. Missing/invalid forwarding addresses share a conservative bucket. The global ceiling bounds cost even if proxy headers are forged. This is a single-process demo limiter, not a distributed abuse defense. Owner-authenticated operator provisioning is not anonymous enrollment.

## Owner approval and identity

approval_url opens /owner?request=<uuid>. The owner signs in through Privy email OTP, then reviews that single request and types CONFIRM to approve. The server verifies the Privy access token (signature, app audience, issuer and expiry), reads the user from Privy, and matches both verified owner_email and the stored Privy user ID. A URL, account token, client-supplied email or another Privy user cannot approve it. Owner mode lists only that logged-in user's accounts; foreign requests appear absent. Denial needs no CONFIRM and grants nothing. After approval: “Approved — your agent can act for 2 minutes”; approval status persists. The timer begins at grant, not at request.

OWNER_TOKEN remains a bank-operator API override only; it is never entered or displayed in the UI. It can manage legacy Atlas and all accounts. Raw operator mutation APIs and the scripted Atlas LIVE API retain their confirmation requirements. Human owners use scoped /api/owner/accounts, /api/owner/approvals and /api/owner/recovery with their Privy bearer token. Recovery requires ownership, CONFIRM and a fresh gateway mandate. Public Vercel refuses all these APIs and does not render Owner mode or /owner.

## Operator setup and clients

Configure Privy email login, embedded wallets, the current tunnel allowed origin, PRIVY_SESSION_SIGNER_ID matching PRIVY_AUTHORIZATION_PRIVATE_KEY, live adapters and OWNER_TOKEN. Restart Next after this store/runtime upgrade. Atlas is not migrated; see [ownership and recovery limits](OWNERSHIP.md).

Claude Code: `claude mcp add unflat --transport http https://circus-thicken-plod.ngrok-free.dev/api/mcp`. After enrollment, reconnect with the account bearer header or private token URL. Hermes uses the same Streamable HTTP URL under mcp_servers.unflat.url; after enrollment add the account Authorization header or private token URL. Restart/reconnect clients after changing credentials. Stdio npm run mcp starts anonymously when UNFLAT_ACCOUNT_TOKEN is absent, and otherwise forwards that account credential; UNFLAT_GATEWAY_URL selects the gateway. No wallet or owner key belongs on the agent laptop.

Standard job: open → owner funds → request/show approval link → wait for approval → pay 5 → save 100 → wait 120 seconds (and poll actual Arkiv expiry) → pay 5 once → report REFUSED, 15 cents remaining and statement. Live amounts are unchanged; tests use mock money.

Ngrok's browser interstitial is upstream of Next: adding a header inside this application cannot bypass an interstitial that never reached it. On 13 September 2026 (Europe/Rome), anonymous Node fetch initialize returned HTTP 200 JSON without a bypass header, and the actual Claude Code `claude mcp get unflat-readonly-check` reported `Status: ✓ Connected` using only the HTTP URL. No account or action tool was called. Hermes is not installed here; its python-httpx User-Agent profile also returned HTTP 200 JSON, but that is not an end-to-end Hermes verification. Browsers may need to visit the interstitial once; a blocked API client must send ngrok-skip-browser-warning:true or use a non-interstitial tunnel.

Tests cover discovery-only onboarding, one-time token handoff, header/query isolation, persistent concurrent enrollment limits, email ownership, per-request approval/CONFIRM, expiry refusal, and zero financial signing after expiry.
