# Public copy audit · 13 September 2026

Scope: rendered homepage at `https://unflat-agents.vercel.app` and the local Next build, both Nova/Atlas tabs, all expandable details, iframe connection text, simulation labels, and local owner-screen copy. The public page was inspected read-only, without starting a run. Authenticated owner controls were checked against source and fake-client/browser tests, not by logging in as the owner or moving funds.

The six Base transactions, two ENS record updates and two Arkiv creations are genuine and correctly attributed. No run hashes or amounts needed replacement. The displayed Atlas archive is the **23:29 Europe/Rome run on September 12**, not the earlier 16:54 video take. Nova is the **02:39 Europe/Rome run on September 13**.

Evidence is in [copy-audit-evidence.json](copy-audit-evidence.json). Reproduce the private-store/RPC/API checks with `node --import tsx scripts/audit-real-runs.ts`; it performs reads only and excludes credentials, owner emails, tokens and commitment secrets. Its private-store checks are auditor evidence, not a public disclosure of the commitment opening. Explorer pages could not be parsed by the web fetcher; transaction existence, logs, inputs and ENS resolution were verified directly over RPC instead.

## String audit

“Verified” means verified to the stated evidence level: chain receipt, API response, local source/store, or explicitly attributed participant report. It does not turn participant reports into on-chain proof. Interface labels with no factual assertion are grouped separately below.

| String or claim before audit → final treatment | Where it appeared | Result | Evidence |
| --- | --- | --- | --- |
| “Your agent has a wallet. It doesn't have a bank.” | Problem headline | Verified as problem framing, not a claim to hold a banking licence | Immediately qualified: “A gateway prototype, not a regulated bank.” |
| “A wallet is a key… Every ‘AI wallet’ ships the key and skips the rest.” | Problem body | Removed | Unsupported universal claim; Privy's own user-owned/delegated wallets contradict that simplification. Replaced with what a wallet alone does not define. |
| “We built the bank.” | Problem bridge | Fixed: “We built that layer.” | This repository implements a gateway, not a regulated bank. |
| “No trust required.” | Problem footnote | Removed | [Signer policy](../src/adapters/live/owner-policy.ts) does not enforce Arkiv expiry or the dollar cap. Operator retains a delegation credential. |
| “A bank account. Built to expire.” | Hero | Fixed: “An agent account. Permission expires.” | Wallets, ENS names, deposits and delegation do not expire with the mandate. |
| “An agent gets… yield… a statement its owner keeps.” | Hero lede | Fixed: access to a savings vault and a statement the owner **can save** | Yield is variable; Swarm publication is a separate owner action, not automatic. |
| “Two real accounts”, “2 minutes”, “Revocations 0” | Repeated hero facts | Removed as redundant | Account identity, duration and creation-only histories have their own evidence locations. |
| “These runs already happened.” | Hero, also during live/simulated views | Fixed by view: archive / simulation / real Base funds | [Dashboard mode](../src/components/dashboard.tsx), immutable snapshots. Previously all non-archive views claimed simulation. |
| “RECORDED ON BASE” / “SIMULATED MONEY” | Card eyebrow | Fixed: archive label, or the actual current money mode | ENS/Arkiv actions are not on Base. Local live execution must not say simulated. |
| “Real run · Base mainnet · 13 Sep 2026” | Nova archive | Verified | Base receipts below; stored timestamps and Rome date agree. Applies to money, not the ENS/Arkiv chain. |
| “Real run · Base mainnet · 12 Sep 2026” | Atlas archive | Verified | Base receipts below; store selects the late-evening Atlas run. |
| `nova.agents.unflat.eth` and Nova wallet | Account card, diagram, identity, footer | Verified; full account identity centralized in card | Sepolia resolve-back and Base senders match. See [run proofs](#run-proofs). Diagram remains explicitly an illustration. |
| `atlas.agents.unflat.eth` and Atlas wallet | Same places in previous-run view | Verified; redundant full-address copy removed | Independent ENS resolution and all three Base senders match. |
| “Owner: Giacomo (email hidden) · owner-owned wallet” | Nova card | Verified ownership; personal name participant-supplied | Privy wallet owner quorum is solely the stored user, threshold 1, zero server keys. Stored email matches Privy's user; email is not published. |
| “Owner: Giacomo (email hidden) · app-owned (legacy) wallet” | Atlas card | Fixed: “Bank operator (legacy)” | Exporter hardcoded Giacomo on both accounts. Atlas has no Privy user owner and its mandate uses operator authority. |
| “Third-party agent via Claude.ai / Claude Code” | Account cards | Fixed: “Participant-reported client” | Client choice is manually supplied in export selection, not authenticated by chain receipts or gateway event IDs. |
| “Story… not a chat transcript” | Six chat-like lines | Verified as a retelling; moved behind details | [runStory](../src/demo/run-story.ts) derives lines from events. It is not a captured conversation. |
| “Name verification pending” / “Resolved from ENS: Not resolved” | Archive identity | Fixed: archive does not refresh resolution; dated audit linked | Snapshots omit `ensMode` and resolved-address fields. `/api/demo` resolves Atlas only and does not update either archive. Both names were independently resolved during this audit. |
| “The same wallet is reused across runs” | Identity details | Removed as a global claim | Each account has its own wallet. Public simulations reuse Atlas's displayed address without a signing wallet. |
| “ENSv2 · Sepolia”, address and record-update proofs | Identity/feed | Verified | ENS record txs are on chain 11155111; their address records identify the Base accounts. Both `mandate.commitment` calldata values match Arkiv. |
| Implied owner ownership of the ENS name | Identity context | Clarified | Name tokens remain deployer-owned. User ownership of Nova's Privy wallet does not transfer ownership of the ENS name. |
| “can act for two minutes”, “02:00”, “Two-minute budget granted” | Budget, stepper, feed | Fixed/qualified: 60 blocks, approximately two minutes | [Arkiv adapter](../src/adapters/live/arkiv.ts) uses `ExpirationTime.fromBlocks(120 / 2)`. Countdown is only an estimate; provisioning already consumes time. Feed now says “Expiring budget granted”. |
| `$1.20` cap, `$1.00` per-action cap | Budget | Verified in store; commitment opening checked privately | 120/100 cents match both snapshots and their stored commitments. Raw limits are not Arkiv attributes; public chain data alone cannot reveal them. |
| `$0.05` transfer; `1.00 USDC` approval/deposit | Stepper/feed | Verified | 50,000 / 1,000,000 token units; canonical USDC has 6 decimals. Approval is not a second deposit. Gas is extra. |
| `$1.05` used; `$0.15` remaining | Budget, hero, story, refusal, statement preview | Verified allowance arithmetic; consolidated in budget | 120 − 5 − 100 = 15 cents. This is **remaining spending permission**, not wallet balance or earned yield. Dollar notation denotes USDC, not a guaranteed dollar exchange rate. |
| “Permission ended. Money remained.” | Refusal section | Fixed: “Permission expired, not the budget.” | A receipt/mandate does not establish a wallet's current cash balance. The budget remained positive. |
| “cannot spend again. Nobody revoked anything.” | Refusal banner | Fixed: “cannot spend under this mandate” | A fresh mandate can permit another action. Owner can still act independently. Expiry did not revoke Privy's signer. Creation-only Arkiv history supports no deletion/extension of these two entities. |
| `REFUSED … block 375871 / 370172` | Statement refusal details | Verified as gateway records, corroborated by historical queries | Same query found the correct entity before expiry and returned `[]` at these blocks. Refusal is off-chain; there is no “refusal transaction”. |
| “Direct Morpho deposit (Privy Earn pending activation)” | Statement, savings, footer, local status | Fixed: “Direct Morpho deposit via Privy signing” | Receipt `to` and decoded `deposit` prove direct ERC-4626. Earlier Privy API 409 was observed, but activation as cause was not established. That limitation is stated once in technical details. |
| “See receipt for shares received” | Both exported deposit events | Fixed: retain exact raw share quantity | Export regex missed the store's `vault shares (… raw)` form. Nova: 961254643264473773; Atlas: 961269432084896269; vault decimals = 18. Store and Deposit logs agree. |
| “4.37% variable APY · Morpho API” | Rate card during initial capture | Verified dynamic source, fixed context | API six-hour realized average changed during audit to 0.04358153472629436 (4.36% rounded). Now labelled **current vault APY**, with source link and fetch timestamp; not either run's realized return. No constant fallback. |
| “AIMorgan fee waived… our own service; relay offline” | Multiple sections and exported events | Removed stale operational explanation | These historical events record dry then free REST; no x402 payment. Current public AIMorgan is mocked. We did not re-test relay availability or claim service ownership. Archive detail now states the recorded free call. |
| “AIMorgan recommends. Gateway only deposits into approved vaults.” | Savings detail | Removed duplicate advice slogan; allowlist implementation retained | [Gateway](../src/core/gateway.ts) chooses from its own allowlist, not AIMorgan vault picks. No extra live service claim in the APY section. |
| “Real encrypted storage, on the owner's funded drive” | Footer under current run | Fixed: **earlier owner-reported** Swarm proof | [Swarm proof](../swarm/README.md#verified-live-proof--owner-reported-2026-09-12) is a different mock-money run, not Nova or this Atlas archive. |
| “5,582 bytes… about four days” | Footer retrieval proof | Verified as owner report, qualified | 2026-09-12 upload: native encryption, deferred, 4.09-day estimate at upload. No permanent retention or current availability guarantee. Fresh-session success was not independently documented. |
| “Save it… retrieve it in any browser” | Owner record | Fixed: optional publishing to funded Swarm ID drive | Browser/SDK support, login, valid reference, postage and network availability are prerequisites. No authenticated upload/download performed during this audit. |
| “gateway never sees the key/reference” | Swarm/privacy and wallet claims | Fixed to distinguish boundaries | Wallet key is held by Privy; gateway has a separate signer credential. Swarm's full reference is visible to this frontend and the Swarm ID iframe, but not sent to gateway APIs. Gateway already knows the plaintext source events. |
| “Native encryption and deferred HTTP upload” | Upload details | Fixed to follow checkbox | `encrypt:true` and HTTP always; `deferred` uses user-selected checkbox. Upload is `uploadData`, retrieval `downloadData` through the iframe. |
| “Connected… owner drive ready” | Swarm connection status | Verified as SDK readiness, not a completed upload | Requires identity, `canUpload`, `uploadMode === 'user-stamp'`. Success bytes/reference appear only after upload; optional retention failure is nonfatal. |
| “Your secret reference is never public” | Footer | Removed absolute guarantee | App does not publish it, but user can share it; anyone with it can decrypt. No live reference included in repository/audit. |
| “Real run shown above; simulations never broadcast” | Money footer | Verified with scope | Refers to **Base money**. Public simulation still writes Arkiv on Tiramisu. Archive is read-only; simulation cannot call live Privy. |
| “Before not captured; after not confirmed” | Archive query footer | Fixed: link dated historical-query audit | Previously misleading empty UI slots, despite actual proven historical expiry. Interactive run still shows only queries it actually captured. |
| “Privy MOCK / AIMorgan MOCK / Arkiv LIVE / Swarm BROWSER / ENS LIVE” | Public technical details | Verified configuration, relabelled scope | `/api/health`: `globalMockOverride:true`; browser Swarm; keyless Sepolia. “LIVE” here means selected adapter, not a fresh service uptime check or archive provenance. |
| Local “Privy LIVE / AIMorgan LIVE / ENS LIVE” | Local technical details | Verified configuration, clarified it is independent of simulation | Same source with current local credentials; dashboard simulation still constructs mock-money runtime. No local live transaction performed. |
| “Run a simulation → / Simulated money · live Arkiv” | Secondary simulation control | Verified | [requireDemoAdapters](../src/demo/dashboard-run.ts) refuses dashboard execution without live Arkiv. `demo:mock` is the separate fully mocked CLI. |
| “Public runs cannot update ENS” | Technical limit | Verified for Vercel; not asserted for every local simulation | `process.env.VERCEL` forces `ReadOnlyEnsAdapter`; local signer-backed configuration can update records even when money is mock. |
| “All accounts” | Logged-in local owner view | Fixed: “Your accounts” | Matching Privy email/user scope; operator override is API-only and absent from UI. |
| “Approved — your agent can act for 2 minutes” after reload | Owner request page | Fixed: original expiry still applies | `approved` is a request status, not proof the mandate remains active. No authorization code changed. |
| “Each pay sends 0.05 / Save deposits 1.00 / Advice fee-waived” | Owner approval details | Fixed: standard demo amounts, agents can choose other amounts within cap | MCP tool schemas accept amounts; server modes and x402 flag determine execution. Confirmation requirements remain unchanged. |
| “Log in on Privy to withdraw or revoke”, owner recovery | Local owner account controls | Verified implemented path, availability qualified | Actual link opens local/tunnel `/owner-wallet`. Email login, wallet selection and separate CONFIRM required. Recovery through gateway additionally needs a new mandate; direct owner Privy action does not. Not a universal hosted Privy recovery portal. |
| “Publish this video take… commit public/real-run.json” | Local completion detail | Fixed: review selections and commit both export paths | Export script explicitly selects two account IDs/dates; does not automatically discover arbitrary new takes. |
| “ETHRome · 40H / Built at ETHRome 2026” | Header/footer | Verified only as participant-supplied project context | User's hackathon brief, not independently verifiable from chain; no new authenticity claim added. |

Non-claim interface strings checked: brand `unflat × agents`, section numbers, `THE PROBLEM`, `FIG. 01`, `THE AGENT ACCOUNT`, `NAME / PAY / SAVE / EXPIRE`, `Latest real run · nova`, `Previous real runs`, `See the real runs`, page/skip anchors, `What is real?`, `Identity / Permission / Budget / Decision / Savings details`, `Publish statement`, `Retrieve`, `Copy secret reference`, `Deferred upload mode`, `Log in with email`, `Owner mode`, `Approve / Deny`, `Grant budget`, CONFIRM labels, loading/error states, and Base/Arkiv/ENS/Swarm chips. These label actual controls/status or destinations; they do not prove successful execution by themselves. Spoofed Swarm connection messages and owner/agent authorization boundaries remain covered by existing tests. Error text is conditional on an observed error, not a claim it occurred in either archive.

## Run proofs

All following receipts returned `status: success`. Base chain ID 8453; Sepolia 11155111; Tiramisu 7738577. Dates in this table are UTC. The UI explicitly labels its gateway-record times as Europe/Rome, which can precede receipt timestamps by seconds; record time is not block time.

| Run / action | Receipt | Block | Chain timestamp | Verified value |
| --- | --- | --- | --- | --- |
| Nova transfer | [0x0e0410d9…](https://basescan.org/tx/0x0e0410d93ac8099a7a21ac2f42f2bbc57b0f0fd4595e332e3d8ac594800c8d54) | 51235321 | Sep 13 00:39:49 | 50,000 USDC units to `0xE8F021FA5a8E67E9C05184d9C47f2a3A749cFF27` |
| Nova approve | [0xd904c06f…](https://basescan.org/tx/0xd904c06f4cea7c517b6aafc3cd14b21282f5abbc3a326dc6a82f196a096679f2) | 51235327 | Sep 13 00:40:01 | 1,000,000 USDC allowance to vault |
| Nova deposit | [0x2c8a940e…](https://basescan.org/tx/0x2c8a940e6e9a19203909d5aee69bf121eb5d39363a8083d761315d6cb676ab0b) | 51235330 | Sep 13 00:40:07 | 1,000,000 assets; 961254643264473773 shares to Nova |
| Atlas transfer | [0xc6d7bdaf…](https://basescan.org/tx/0xc6d7bdaf243667ead95b6263fd7dc68155948511b088797c2c2595aaced1a092) | 51229607 | Sep 12 21:29:21 | 50,000 USDC units to same recipient |
| Atlas approve | [0xa3a0c101…](https://basescan.org/tx/0xa3a0c1016d2e94fa08b26882b7038614345bf870d9fee5507a08bafd9b2edb0d) | 51229622 | Sep 12 21:29:51 | 1,000,000 USDC allowance to vault |
| Atlas deposit | [0x491cd7ac…](https://basescan.org/tx/0x491cd7ac3361569a736ea2854b9e860a06d8903e50e6d626331c42658b6e1c8f) | 51229624 | Sep 12 21:29:55 | 1,000,000 assets; 961269432084896269 shares to Atlas |
| Nova ENS records | [0x6f10f207…](https://sepolia.etherscan.io/tx/0x6f10f20729658dd2a099f5a5297d9558105b64ec50c9eb8accc92106847e5e2a) | 11692461 | Sepolia | Owner and `mandate.commitment` updated for Nova's namehash |
| Atlas ENS records | [0x2ac248f9…](https://sepolia.etherscan.io/tx/0x2ac248f98f73a3f038107860732ef2bfe908834ad95b9fbe344c18adf2ab6f93) | 11691538 | Sepolia | Owner and `mandate.commitment` updated for Atlas's namehash |

Resolved independently during the audit:

- [nova.agents.unflat.eth](https://explorer.ens.dev/nova.agents.unflat.eth) → [0x9ecDF92f11F8DD5e1DC25C597436171321b8a135](https://basescan.org/address/0x9ecDF92f11F8DD5e1DC25C597436171321b8a135).
- [atlas.agents.unflat.eth](https://explorer.ens.dev/atlas.agents.unflat.eth) → [0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7](https://basescan.org/address/0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7).
- Both records use resolver `0xaE1b4c85aa0D93F20A6Ff29df6B19A2df45b70Ca`; gateway text is `https://unflat-agents.vercel.app`. Current commitment text matched each snapshot. These receipt links are **record updates**, not new name registration transactions.
- [Steakhouse Prime USDC](https://basescan.org/address/0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9): `asset()` = canonical Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals); vault shares = 18 decimals. Displayed API value is fetched from [Morpho's six-hour average endpoint](https://api.morpho.org/v1/vaults-v2/8453:0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9/apy-averages?lookback=six_hours), not derived from the two demo deposits.

### Arkiv expiry

| Run | Entity / creation receipt | Created → expires | Before → after |
| --- | --- | --- | --- |
| Nova | [0xe6002dd0…](https://tiramisu.explorer.arkiv.network/entity/0xe6002dd0fe19e6a3cf4a95a1dcb52ed96caa4a1520720078b7cfbc3c7ea63b80) / [0xd71ae75a…](https://tiramisu.explorer.arkiv.network/tx/0xd71ae75ac3d0dd8382429a64e8b5e6a1e76e1f1608bdd84542183ac995ee4d82) | 375783 → 375843 | found at 375816 → empty at 375871 |
| Atlas | [0xa9f7c8f7…](https://tiramisu.explorer.arkiv.network/entity/0xa9f7c8f709701465979b47ac3ad846ec882f3f66292301971f78f5028b229701) / [0xabe5d149…](https://tiramisu.explorer.arkiv.network/tx/0xabe5d1497aaf014dd7810514520d7640cd8b216349d57492ff25da921dfdd8fc) | 370089 → 370149 | found at 370102 → empty at 370172 |

For each run we repeated **identical query text** at the two historical blocks using SDK `atBlock`; the lower expiry bound stays fixed to the before block to show natural disappearance, not just a changed filter:

```text
agent_id = str('39086473-4800-45dc-9d1f-7c1a89f18273') AND $expiresAt > u64(375816) AND $creator = addr(0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf)
agent_id = str('06b25dc5-51d0-4f23-8910-ee16bfad6bc0') AND $expiresAt > u64(370102) AND $creator = addr(0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf)
```

Each before result contains exactly `agent_id`, `expiry`, `commitment`, and empty payload. The commitments match the snapshot, ENS tx calldata, and a private recomputation from the stored caps/secret. Each after result is `[]`. A fresh current-head query was also empty. `eth_getLogs` filtered by each entity key from creation through audit head returned only `EntityCreated`: no `EntityDeleted`, `ExpiryExtended`, patch or transfer. This is entity-specific evidence; it is **not** a claim that the creator address's entire history contains only two transactions.

The original gateway refusals remain unchanged in both snapshots. [MandateService](../src/core/mandates.ts) fresh-queries Arkiv and rejects absence before reserving expenditure; [SigningGateway](../src/core/gateway.ts) refuses before x402 or Privy signing on the financial action path. ENS resolution is also required. These software checks are distinct from Privy's longer-lived signer policy.

### Privy and Swarm limits

ENS ownership was separately read with `getOwner(uint256(keccak256(label)))` for `nova` and `atlas` on the agents registry `0xFA8ac57Bec5421a2F62CDD774A62217f035a4C90`. Both return deployer `0x097630f29ea1b08988A277eb18a8535C626Ed557`, not the Privy wallet owner.

Nova API read-back: Ethereum wallet matches the chain address, owner quorum contains exactly the stored Privy user (threshold 1, zero authorization keys), wallet has no global policies, and one additional signer with the stored override policy. Policy ownership is also solely that user. Rules allow Base canonical-USDC transfer/approval, allowlisted-vault deposit/redeem, and USDC-domain typed data, and deny key/seed export. **There is no Arkiv query, spending cap or TTL in that policy.** Atlas API read-back: legacy app-owned wallet, one wallet policy, no additional signer. No API secrets, user IDs or emails are published here.

Swarm evidence remains [owner-reported](../swarm/README.md#verified-live-proof--owner-reported-2026-09-12). No private reference was used or published in this audit, so current decryptability and a fresh-session retrieval are not independently claimed. See [Swarm ID architecture](https://swarm.snaha.net/docs/architecture/) and [Privy pregeneration](https://docs.privy.io/recipes/pregenerate-wallets) for provider behavior; source and observed read-back determine what this app actually implements.

## Consolidation

- Account card: name, funding address, ownership and attributed client. Secondary identity section explains the verification boundary, not a second live account.
- Budget section: cap, used allowance, remaining allowance and expiry/creation link. Hero links there; refusal does not recast allowance as cash.
- Action feed: each transaction and its proof, plus share quantity in deposit details. Gateway timestamps have one explicit timezone.
- Savings: one current APY, one source and fetch time. Advice/activation history is not repeated there.
- Owner record: current publication controls. Footer: distinctly dated earlier Swarm evidence and trust limits.
- Retelling and combined proof index are collapsed details, not another primary rendering of the same story. Runtime configuration is labelled independently of archived evidence.

No gateway authorization, signing, adapter selection, owner/agent permissions, payment amounts or execution flow changed. Changes are copy, provenance labels, export text/share retention, proof placement and regression assertions for those labels.

## Verification

On 13 September 2026: 107 unit tests across 31 files, all 11 browser tests, `npm run demo:mock`, typecheck and production build passed. Browser tests use synthetic Swarm references: they test isolation and retrieval mechanics, not the availability of the owner's live upload. The separate read-only RPC/Privy audit completed successfully for both archived runs. No live wallet creation or Base transaction was made during verification.
