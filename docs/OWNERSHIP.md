# Owner-owned wallets

New MCP accounts are pregenerated for the human owner's **email identity in this Privy app**. Atlas and existing app-owned accounts are legacy: their wallets, balances, names and history are not migrated.

## Nine-step flow

1. The owner asks their agent to open an account and provides the correct owner email privately.
2. The agent connects with the enrollment-only `MCP_AGENT_TOKEN` and calls `get_account({"name":"nova","owner_email":"owner@example.com"})`.
3. The bank looks up or creates that email's Privy user. It asks Privy to pregenerate a new embedded Ethereum wallet for that user—not an app-owned server wallet.
4. Privy returns the wallet address with the gateway as an **additional signer**. Its signer-specific policy is itself owned by the user. The bank reads back wallet ownership, policy ownership and signer configuration; any mismatch fails closed. No wallet private key passes through the bank.
5. The agent receives the funding address and its per-account token **once**. It saves the token privately and reconnects with it for subsequent account calls. The bank stores only its hash. The owner sees the email, ownership label and address in Owner mode.
6. The owner verifies the email and ready/live status, then funds that address with Base USDC and ETH for gas. A typo creates a wallet for the wrong email: do not fund it. Enrollment does not prove that the agent controls the supplied email.
7. The agent requests a mandate. The `OWNER_TOKEN` holder approves with typed `CONFIRM`: two minutes, $1.20 total cap, $1.00 per action. The Arkiv entity, ENS commitment record and fresh authorization queries work as before.
8. The agent pays or saves through its account token. The gateway checks Arkiv, ENS, budget, AIMorgan price validation and independent preflight before signing. The agent has neither the wallet key nor the session-signing authorization key.
9. The mandate expires naturally and the next agent action is refused, with money still available. Nobody needs to revoke anything for this refusal. Separately, the owner can now—or at any earlier time—log in with Privy to withdraw, export their key or revoke the delegation.

## Two different owner controls

**Gateway Owner mode:** `OWNER_TOKEN` is operator authority over all gateway accounts, not proof of access to any email inbox. Pending approval and grant remain CONFIRM-gated. A direct **Grant budget** for an owner-owned account also permits the owner-only `earn.recall` and `owner.transfer` operations; approving an agent's pending request does not add those operations. Both recovery operations require another typed CONFIRM and a fresh unexpired mandate, ENS resolution, AIMorgan `allPassed === true`, and preflight. Recall redeems a specified raw share quantity into the same account wallet, with no approval transaction and no consumption of the spending cap. Transfer-to-owner sends 1 USDC in the UI (API: 1–100 cents) to the external address explicitly entered by the owner; that address is not cryptographically verified against the email. Grant a fresh budget after expiry. Agent credentials cannot invoke these endpoints or grant permission.

**Privy owner screen:** the per-account **Log in on Privy to withdraw or revoke** link opens `/owner-wallet` on the local gateway/tunnel. Authenticate with the email from enrollment, then explicitly select the wallet. This screen uses the user's Privy session directly—not the gateway signer, MCP token, OWNER_TOKEN, or app secret. It never creates a wallet on login. Each withdrawal, export or revocation requires a fresh typed CONFIRM and any Privy authentication/confirmation UI. Transactions here are always real Base transactions plus gas, even if the dashboard demo is mocked. Owner actions do not require an agent mandate. Withdraw USDC, remove all additional signers with `useSigners().removeSigners`, or export with `useExportWallet`; the private key is displayed on Privy's isolated origin, not returned to gateway JavaScript or APIs. Vault shares must first be redeemed; use gateway recall or an external wallet client after export. Public Vercel returns 404 for this screen and refuses all owner/MCP APIs.

## What the bank can and cannot do

The additional signer's Privy policy is default-deny. It permits only:

| Method | Scope |
| --- | --- |
| `eth_sendTransaction` | Base, zero native ETH value; canonical USDC `transfer` |
| `eth_sendTransaction` | Canonical USDC `approve`, spender restricted to configured direct-vault addresses |
| `eth_sendTransaction` | `deposit` / `redeem` on those allowlisted ERC-4626 vaults |
| `eth_signTypedData_v4` | Base chain ID and canonical USDC verifying contract only |
| Export / other methods | Denied; no arbitrary contract calls, ETH transfers, raw signing, wallet updates or owner changes through the delegation |

`approve` is called on USDC, with the vault as spender; deposit/redeem are called on the vault. The narrow policy deliberately does not allow `earn_deposit`: new owner-owned accounts use the direct Morpho path, so keep `EARN_VIA_PRIVY=false`. The existing legacy Earn path is unchanged.

The policy's owner is the Privy user, not the app or the gateway authorization key. The bank cannot widen that policy with its app secret alone, export the wallet, replace its owner, or re-add a revoked signer to that wallet without owner authorization. No server key is inserted into the owner's quorum. The owner remains unrestricted by the signer's override policy.

The policy is **not the Arkiv mandate**. Privy does not query Arkiv. Budget/expiry enforcement is in our gateway, while Privy limits what its signer can sign. A compromised gateway with the delegation key could exercise the allowed USDC transfer/typed-data and vault operations without respecting our software budget. Transfer recipients and deposit/redeem receivers are further restricted by gateway code, not by this initial policy. Do not mistake the narrow method allowlist for a cryptographic spending cap or protection against a malicious bank. Owners can revoke the delegation in Privy; natural mandate expiry remains the normal refusal mechanism.

## If the bank disappears

Funds and vault shares remain at the owner's on-chain address, not in the gateway store. The safest independent exit is to **export and securely back up the key in advance**: import it into a trusted external wallet, keep Base gas available, and redeem/transfer without the bank, ENS, Arkiv, AIMorgan or MCP. Revoke the delegated signer while Privy access is available; exporting a key does not by itself revoke an existing signer.

Without an exported key, recovery still depends on Privy availability, the original app identity and a working, allowed-origin owner-login client. This branch supplies that client, but hosting it on the same server is not independent disaster recovery. Arrange a separately hosted, allowlisted recovery client before relying on bank-independent login. If the bank is gone before that is arranged, contact Privy; this implementation cannot promise that Privy Home provides withdrawal/export/revocation for this app. We link to our actual Privy-authenticated controls instead of claiming an unverified universal recovery portal.

## Configuration and first live check

- Existing `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_PRIVATE_KEY` and `BASE_RPC_URL` remain required. `PRIVY_POLICY_ID` continues to serve legacy wallets only; each new owner account gets its own user-owned signer policy.
- Add `PRIVY_SESSION_SIGNER_ID`: the Privy authorization-key/key-quorum ID corresponding to `PRIVY_AUTHORIZATION_PRIVATE_KEY`. Configure that signer in the app Dashboard. Never use the app secret as a signer key or make the server a wallet co-owner.
- Enable email login and embedded Ethereum wallets in this Privy app. Add the actual HTTPS tunnel origin to Privy's allowed URLs. `/owner-wallet` receives only the public app ID; no new `NEXT_PUBLIC_` secret is used. Restart Next after env/schema changes.
- Use complete ENS/Arkiv/Base configuration and `MOCK_MODE=false` for live enrollment. Missing signer configuration refuses enrollment; it never silently creates an app-owned wallet. No credentials are generated or live wallets created during verification of this branch.
- After a separately authorized enrollment, the owner should first log in and verify wallet access, export/revoke controls and address matching **before funding**. Mock tests prove request construction and boundaries, not live Privy acceptance or owner-login readiness.

Owner email, Privy user ID and delegation metadata stay in the ignored, mode-0600 gateway store. Email is not placed in ENS or Arkiv. Public snapshot export remains field-allowlisted. The owner may keep their private statement on Swarm, whose encryption reference remains browser-only.

## Documentation checks and implementation notes

The requested older pregeneration/session-signer URLs did not resolve in the docs fetcher; the current index points to [pregenerating wallets](https://docs.privy.io/recipes/pregenerate-wallets) and [additional signers](https://docs.privy.io/wallets/using-wallets/signers/overview). The recipe includes `wallet_index` and `create_direct_signer` fields absent from the installed Node 0.34.0 types and current typed pregeneration request. We use supported `users().pregenerateWallets`, unique `external_id`, `additional_signers` and `override_policy_ids`, and verify sole-user ownership afterward rather than casting unsupported options into the SDK.

Other primary references: [user-owned wallets](https://docs.privy.io/controls/authorization-keys/owners/configuration/user), [creating policies](https://docs.privy.io/controls/policies/create-a-policy), [deny-first/default-deny evaluation](https://docs.privy.io/controls/policies/overview), [Ethereum policy conditions](https://docs.privy.io/controls/policies/example-policies/ethereum), [remove signers](https://docs.privy.io/wallets/using-wallets/signers/remove-signers), [key export isolation](https://docs.privy.io/wallets/wallets/export).

The browser SDK is lazy-loaded only on `/owner-wallet`, never in the public dashboard's initial bundle. `ox@0.8.9` supplies its optional `permissionless` peer; the existing viem keeps its own newer ox dependency. Scoped ws 8.x and axios 1.x overrides patch newly introduced transitive versions without changing the existing ws 7.x or Swarm's axios 0.x dependency. Remaining third-party advisories need review before production; do not treat green functional checks as a security audit.
