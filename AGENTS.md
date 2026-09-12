# Repository instructions

- Keep files small and single-purpose. Prefer explicit data flow over abstractions.
- `SigningGateway` is the only path to a signing-capable adapter.
- Re-check and reserve the mandate immediately before every Privy signing or Earn call.
- Refuse unless AIMorgan returned `priceValidation.allPassed === true`.
- AIMorgan is an external advisory service. Never vendor its code or trust its stored state or vault selection.
- Call AIMorgan strategize with `dry: true` before the paid REST call. Never use AIMorgan's MCP or `?free=true` path for a demo payment.
- Deposit only to `UNFLAT_VAULT_ALLOWLIST`: direct Morpho uses exact approval plus `eth_call` simulation, while Privy Earn remains behind `EARN_VIA_PRIVY=true`.
- Mandates, trusted strategies, and idempotency records belong in the unflat store.
- Every decision must include a human-readable reason suitable for the statement and dashboard.
- Do not add secrets or secret defaults. Use `.env`, which must remain ignored.
- Preserve mock mode and the deterministic refusal scene.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
