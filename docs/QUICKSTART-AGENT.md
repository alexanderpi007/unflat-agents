# Two roles, one temporary tunnel

The gateway runs on the operator’s machine. Giacomo’s **owner laptop** and the **agent laptop** both connect through the same HTTPS ngrok URL. Neither needs to be localhost. The public Vercel site remains mock-only with no Owner mode or MCP execution.

## Operator setup (gateway machine)

In the ignored `.env`, set two **different, random secrets of at least 32 characters**: `OWNER_TOKEN` and `MCP_AGENT_TOKEN`. Generate each with `openssl rand -hex 32` if absent. Never use `NEXT_PUBLIC_` variables for them. Share tokens privately, separately—not in chat with the agent, URLs, screenshots, or git. An agent receives only `MCP_AGENT_TOKEN`; Giacomo receives only `OWNER_TOKEN`.

For real money, use `MOCK_MODE=false`, the existing complete Privy/Base/AIMorgan/Arkiv configuration, `AIMORGAN_X402=false`, `EARN_VIA_PRIVY=false`, and the funded persistent wallet in `.data/gateway.json`. Owner approvals display the actual money mode. Missing live prerequisites refuse execution; `MOCK_MODE=true` makes MCP money mocked. `demo:mock` stays completely mocked. Do not run another gateway process or CLI transaction writer against the same file store during the demo.

```sh
npm run build
npm run start -- --port 3000
# In a second terminal:
ngrok http 3000
```

Use the displayed HTTPS forwarding URL, for example `https://YOUR-TUNNEL.ngrok-free.app`. Keep the incoming Host unchanged (do not use ngrok host-header rewriting). The production build avoids Next dev/HMR origin issues. Open ngrok’s browser interstitial once if shown. HTTPS terminates at the tunnel provider; it is part of the trust boundary and its request inspector may capture Authorization headers. Do not publish inspection logs.

If using `npm run dev`, the tunnel hostname must also appear in `next.config.ts` → `allowedDevOrigins` (currently `circus-thicken-plod.ngrok-free.dev`). Without it, Next rejects the dev WebSocket origin and the page may show static buttons that never respond. Use the exact hostname, not a wildcard. Next normally restarts automatically on config changes; refresh the browser afterward. Verify the actual tunnel with `UNFLAT_TUNNEL_URL=https://YOUR-TUNNEL.ngrok-free.app npx playwright test --config playwright.tunnel.config.ts`. This read-only test supplies `ngrok-skip-browser-warning: true` and opens the inline login form without entering any credentials or executing actions.

## Owner laptop — Giacomo

1. Open `https://YOUR-TUNNEL.ngrok-free.app`, then **Owner mode**.
2. Enter **OWNER_TOKEN**, then **Unlock Owner mode**. Login remains in that tab’s `sessionStorage` across reloads; sign out or close the tab when finished. It is sent only as an Authorization header to same-origin owner/LIVE APIs, never a URL or MCP tool argument.
3. In **Owner approvals**, wait for the agent’s pending request (refreshes every five seconds).
4. Review recipient/vault under **Approval details**, the actual mock/live mode, two-minute expiry, $1.20 total cap, and $1.00 per-action cap. A pay is fixed at 0.05 USDC; save is fixed at 1.00 USDC. The agent may repeat actions within the $1.20 cap, plus gas—not merely one 1.05 USDC sequence.
5. Type **CONFIRM** for this request, then **Approve (2 minutes, $1.20 cap)**. The two minutes begin when granted, not when requested. **Deny** grants nothing and does not need CONFIRM. Neither request nor denial signs a Base transaction.
6. The separate **Run LIVE (Base mainnet)** button is the scripted video run, with its own typed CONFIRM and 1.05 USDC + gas plan. Do not click it for the agent walkthrough: the agent invokes its own actions after approval.

The owner token grants administrative authority; typed CONFIRM records explicit consent, not a second authentication factor. Anyone holding that token can act as owner. Closing the UI does not revoke an already approved mandate: it naturally expires. Agents have no `grant_mandate` tool and cannot choose another wallet, recipient, vault, cap, or expiry.

## Agent laptop — Claude Code

Set `MCP_AGENT_TOKEN` privately in the agent process environment, then register the HTTP endpoint in user scope (not a committed project config):

```sh
claude mcp add --transport http --scope user unflat https://YOUR-TUNNEL.ngrok-free.app/api/mcp \
  --header 'Authorization: Bearer ${MCP_AGENT_TOKEN}' \
  --header 'ngrok-skip-browser-warning: true'
```

Claude Code supports environment expansion in MCP headers; single quotes keep the token value out of the stored command/config. Start Claude with that variable available, open `/mcp`, and check that unflat exposes six tools. See [Claude Code’s MCP documentation](https://code.claude.com/docs/en/mcp). Allow up to three minutes for a tool involving chain confirmation; do not automatically retry a timeout with a new action key.

## Agent laptop — Hermes

In the agent’s private `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  unflat:
    url: "https://YOUR-TUNNEL.ngrok-free.app/api/mcp"
    headers:
      Authorization: "Bearer ${MCP_AGENT_TOKEN}"
      ngrok-skip-browser-warning: "true"
    timeout: 180
    supports_parallel_tool_calls: false
```

Put only the agent token in the agent’s private environment/`~/.hermes/.env`, then restart Hermes. The `url`, `headers`, and environment-variable substitution follow [Hermes’ MCP configuration reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference). Do not give either agent local filesystem access to the gateway’s `.env` or signing keys.

## Six-line agent walkthrough

```text
get_account {} — read name, wallet, balance, and mandate decision.
request_mandate {"purpose":"Send five cents, save one dollar, then prove expiry."} — expect pending.
Poll get_account every 5 seconds; wait for owner approval AND mandate.allowed=true. Stop if denied.
pay {"amountUsdcCents":5,"idempotencyKey":"take-001-pay"} — send 0.05 USDC.
save {"amountUsdcCents":100,"idempotencyKey":"take-001-save"} — dry/free advice, approve, deposit 1 USDC.
Wait until permission expires; pay {"amountUsdcCents":5,"idempotencyKey":"take-001-expired"} — expect REFUSED, $0.15 unspent.
```

`statement {}` reads this agent account’s current-run decisions even after expiry. `strategize` is also available explicitly; `save` invokes it automatically. Use new keys for genuinely new actions, reuse a key only for the identical uncertain request, and inspect the statement before retrying. Approval/signing may consume some of the two-minute window: expiry always wins.

One `MCP_AGENT_TOKEN` represents one agent role/account; anyone sharing it shares that identity. This account reuses the persistent Privy wallet but has a separate mandate from the scripted dashboard run, so it cannot borrow the demo’s approval. Requests and approval state persist in the gateway file store; Arkiv is queried afresh for authorization, never a local authorization cache.

## Stdio and teardown

`npm run mcp` remains available. Configure stdio clients to launch `npm run --silent mcp` from the repo directory so npm’s lifecycle banner does not pollute protocol stdout. Provide `MCP_AGENT_TOKEN` and `UNFLAT_GATEWAY_URL` in that process environment; the bridge forwards the same six tools to authenticated HTTP, with no signer or owner token. It does not read the gateway’s `.env` for the remote agent.

After the demonstration, stop ngrok, sign out the owner, remove the agent’s client configuration, and rotate both gateway tokens before the next shared session. Restart Next after `.env` changes. Tokens must not be deployed to Vercel; the backend denies owner/MCP access there even if they are present. This is a short-lived hackathon integration, not a production multi-user authentication service.
