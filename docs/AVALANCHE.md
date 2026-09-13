# Avalanche Fuji: pay only

Implemented on branch `avalanche`, not merged or deployed. Verification uses mocked Privy/RPC clients; it does not claim a live Fuji payment. Existing Base accounts, including Atlas and nova, are unchanged.

## Network and enrollment

| Setting | Value |
| --- | --- |
| Account chain | `avalanche-fuji` (default for omitted chain remains `base`) |
| Chain / CAIP-2 | `43113` / `eip155:43113` |
| Public RPC | `https://api.avax-test.network/ext/bc/C/rpc` |
| Optional RPC override | `FUJI_RPC_URL` in `.env` |
| Circle USDC | `0x5425890298aed601595a70AB815c96711a31Bc65` |
| Gas | Fuji AVAX |
| Receipt links | `https://testnet.snowtrace.io/tx/<hash>` |

[Avalanche network documentation](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/04-x402-on-avalanche/02-network-setup) and [Circle's token list](https://developers.circle.com/stablecoins/usdc-contract-addresses) identify this network/token. A read-only RPC check on 13 September 2026 returned chain 43113, deployed token bytecode, symbol USDC and 6 decimals. Testnet tokens have no monetary value.

Keep the existing local live configuration (Privy, signer authorization, Base RPC/allowlist, Arkiv and ENS); this branch adds a payment network, not a separate Fuji-only runtime. Set `MOCK_MODE=false`, `AIMORGAN_X402=false`, `EARN_VIA_PRIVY=false`. Vercel still disables owner/MCP access and forces mock money. `demo:mock` stays fully mocked.

After manually configuring the policy below, call the existing MCP URL with:

```js
get_account({name: "your-new-agent-name", owner_email: "the-owner-email", chain: "avalanche-fuji"})
```

Use the actual owner's email and an unused name. Enrollment returns `funding_address`, `chain`, `network`, `testnet`, `money_mode`, and the one-time `account_token`. Save that token privately; never fund a mock or incomplete account. An authenticated session can read the account without repeating the token. Other sessions use the saved token as before.

A new account still gets its own owner-owned Privy Ethereum wallet. Selecting Fuji does not generate a second chain-specific key/address: that same EVM wallet address is valid on Base and Fuji, but this gateway account routes only to its selected chain. Existing names cannot be reclaimed or switched to Fuji; no existing wallet or token was migrated.

## Privy Dashboard: exact manual rule

Create a **separate Ethereum policy for the Fuji owner's session signer**, named e.g. `unflat Fuji USDC pay`. Do not widen the policy on Atlas/nova. This branch deliberately does **not** create or edit Fuji policies through code. Put the resulting policy ID in `PRIVY_FUJI_POLICY_ID` in `.env`.

The policy must be owned solely by the same Privy user as `owner_email`, using a threshold-one user quorum without server authorization keys or other owners. Use the owner's existing Privy user identity; an app-owned policy is not an acceptable substitute. User-owned policy updates require that owner's authorization. If the Dashboard cannot assign that user as policy owner, stop and complete the owner-authorized policy setup with Privy; do not remove the ownership check. This single configured policy can enroll multiple names for that owner, not a different email owner.

Add **one ALLOW rule**, method **`eth_sendTransaction`**, with **all five conditions in the same rule**:

| Field source | Field | Operator | Value |
| --- | --- | --- | --- |
| `ethereum_transaction` | `chain_id` | `eq` | `43113` |
| `ethereum_transaction` | `value` | `eq` | `0` |
| `ethereum_transaction` | `to` | `eq` | `0x5425890298aed601595a70AB815c96711a31Bc65` |
| `ethereum_calldata` | `function_name` | `eq` | `transfer` |
| `ethereum_calldata` | `transfer.amount` | `lte` | `1000000` |

Attach this JSON ABI to **both** calldata conditions; `transfer.amount` uses the ABI input name, not a native-token field:

```json
[{"type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"name":"recipient","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"type":"bool"}]}]
```

Native value is exactly zero AVAX; this does not cover or prohibit gas fees. The token limit is **1 USDC per transaction**, in raw six-decimal units. MCP `pay` sends **0.05 USDC = 50000 raw units**. The gateway's separate $1.20 total / $1.00 per-action budget and Arkiv expiry are not encoded in this Privy rule. The rule does not restrict the USDC recipient; the gateway fixes it to `DEMO_PAYMENT_RECIPIENT`.

Do not add other ALLOW rules (including approve, deposit, typed-data signing or export); unmatched methods default to DENY. Explicit DENY rules may be added. The gateway reads and validates the policy and sole-user ownership before wallet provisioning, then attaches its ID as the gateway additional signer's `override_policy_ids`. The wallet itself has no policy restricting its human owner. Missing/mismatched configuration refuses enrollment; no app-owned fallback.

These conditions follow [Privy's policy model](https://docs.privy.io/controls/policies/overview) and [Ethereum examples](https://docs.privy.io/controls/policies/example-policies/ethereum): conditions within a rule are ANDed; separate ALLOW rules are alternatives, not cumulative restrictions.

## Fund and run

1. Give the owner the **exact `funding_address` returned by ready live Fuji enrollment**, also shown with a Fuji badge in Owner mode. No live Fuji account was created during branch verification, so no new funding address is claimed here. Do not use the synthetic addresses in tests or assume an existing Base account has been switched.
2. Obtain test AVAX from the [Avalanche Console faucet](https://build.avax.network/console/primary-network/faucet). If the faucet funds your connected owner wallet, send some Fuji AVAX onward to the agent's returned address on chain 43113.
3. At [Circle's faucet](https://faucet.circle.com), choose **USDC → Avalanche Fuji** and paste that same agent address. Both faucets supply test assets, not mainnet money.
4. Agent calls `request_mandate`, gives `approval_url` to the owner, and polls `get_account`. The owner signs in with the matching Privy email and types **CONFIRM**. Permission starts at approval, lasts approximately two minutes, and is independently queried from Arkiv for every action.
5. Agent calls `pay({amountUsdcCents:5,idempotency_key:"unique-fuji-payment"})`. The existing configured EVM recipient is used on **Fuji**, not Base. The response and statement show the confirmed Snowtrace link.
6. Skip savings. Wait for actual Arkiv expiry, then call pay once with a fresh key to demonstrate refusal. Report the readable refusal, **115 cents of unused budget**, and `statement`. Do not retry uncertain or refused payments.

Preflight independently reads the RPC chain ID, USDC decimals and balance, estimates the exact transfer's gas, and checks AVAX against the estimated max fee with a 20% gas-unit margin. A plain ERC-20 transfer needs no allowance and sends no approve transaction. AIMorgan's required `priceValidation.allPassed === true` remains an advisory safety gate; its Base-oriented strategy is never used for a Fuji deposit. After preflight the gateway performs another fresh mandate check immediately before the Privy signing call.

`save()` returns **“not supported on this chain”**, as do Base-only advice, x402, and gateway recovery actions on Fuji. No savings, approval, redemption or Base transaction is attempted. The owner's Privy export/revoke access remains; the app's direct owner withdrawal controls remain Base-only. ENS resolves the same wallet address on Sepolia, Arkiv remains on Tiramisu, and Swarm statement ownership/encryption are unchanged.

## Verification

The tests exercise the real payment/preflight classes with mocked RPC and Privy signing: exact Fuji transaction payload, confirmed transfer log, no Base RPC/allowance, no signing after expiry (including expiry during preflight), insufficient AVAX/USDC, wrong chain/decimals, reverted simulation, failed price validation, idempotency, unsupported savings, and a fake HTTP MCP client's owner-approved flow. Policy tests verify read-only configuration and reject widened rules. No live wallet creation, policy change or transaction is part of these tests.

13 September branch check: `npm run test` — 125 tests passed; `npm run typecheck` and `npm run build` passed; `npm run demo:mock` completed with 15 cents left and expiry refusal; `npm run test:swarm` — 13 browser tests passed, including the Fuji account badge, Snowtrace link and confirmation controls. The configured `.env` has no `PRIVY_FUJI_POLICY_ID` yet: live Fuji enrollment is intentionally blocked until manual policy setup.
