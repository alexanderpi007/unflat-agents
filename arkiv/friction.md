# Arkiv integration friction log

Recorded during ETHRome 2026 work on Mission 02, against the public documentation and the installed `@arkiv-network/sdk` package.

## 2026-09-12 — documentation and SDK review

### 1. Current network is absent from SDK 0.7.0

- Expected: the current documentation names Tiramisu as the public testnet (chain ID `7738577`, RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`).
- Actual: `@arkiv-network/sdk@0.7.0` exports only `braga`, `kaolin`, and `localhost` from `@arkiv-network/sdk/chains`. The existing adapter imports `braga` (chain ID `60138453102`).
- Reproduction: install the pinned dependencies, inspect `node_modules/@arkiv-network/sdk/dist/chains`, and compare them with <https://docs.arkiv.network/networks/tiramisu/>.
- Impact: the existing adapter targets a retired network. A custom viem chain definition may work, but SDK 0.7 protocol compatibility with Tiramisu must be proven against the live network.

### 2. Current docs describe a newer mutation API than SDK 0.7.0

- Expected from the current docs: `attributes` is an object using typed helpers, TTL is passed as `expires: ExpirationTime.fromMinutes(2)`, and the response includes `entityKey`, `txHash`, and `expiresAt`.
- Actual in `@arkiv-network/sdk@0.7.0`: `attributes` is an `Attribute[]`, TTL is `expiresIn: number`, `ExpirationTime` is imported from `@arkiv-network/sdk/utils`, and the response type contains only `entityKey` and `txHash`.
- Reproduction: compare <https://docs.arkiv.network/typescript-sdk/mutating-data/> with the installed package declarations.
- Impact: current documentation examples do not type-check against the requested 0.7.x SDK. The integration must either use the 0.7 API deliberately or upgrade after confirming the bounty's accepted version.

### 3. Public docs and the official repository are temporarily inconsistent

- Expected: one canonical getting-started path for the current public testnet.
- Actual: the documentation site now points to Tiramisu, while examples in the official SDK repository/search index still mention Braga and older 0.6-era syntax.
- Reproduction: compare <https://docs.arkiv.network/> and <https://github.com/arkiv-network/arkiv-sdk-js>.
- Impact: copying an official example can silently select a retired chain or obsolete API.

### 4. Existing adapter publishes confidential mandate fields

- Expected for this project: Arkiv contains only the agent identifier, expiry, and a commitment; raw caps and the commitment secret remain off-chain.
- Actual: `src/adapters/live/arkiv.ts` puts `allowedActions`, `maxPerActionUsdcCents`, `maxTotalUsdcCents`, `startsAt`, and `expiresAt` in the public JSON payload.
- Impact: the current entity reveals the mandate amounts and action scope.

### 5. Existing adapter has no live authorization query

- Expected: each gateway action queries Arkiv by agent ID and accepts only a live, unexpired entity.
- Actual: the adapter only creates an entity. Authorization reads the local gateway store and compares a local wall clock.
- Impact: Arkiv TTL is not currently the source of authorization; expiry on Arkiv cannot cause the required refusal.

### 6. Existing adapter loses transaction evidence

- Expected: the demo can show an Arkiv entity identifier/link and the creation transaction.
- Actual: the SDK returns `txHash`, but the adapter returns only `entityKey`.
- Impact: the current demo cannot provide independently inspectable write evidence.

### 7. Wall-clock TTL and block expiry can diverge

- Expected: authorization is determined by whether the entity remains in Arkiv's live query surface.
- Actual: the current adapter calculates `expiresIn` from a local ISO timestamp and rounds to an even number of seconds. The TTL starts when the transaction lands, so Arkiv expiry can be later than the local deadline.
- Impact: mixing the local timestamp and Arkiv query result creates two conflicting expiry authorities. The live query must be authoritative.

### 8. Shared-database provenance is not checked

- Expected from Arkiv best practices: queries include a project attribute and `$creator`, because another writer can copy application attributes.
- Actual: no query exists, and the current schema has no creator filter.
- Impact: querying only `agentId` would permit an unrelated writer to create a look-alike live mandate.

### 9. Access keys and wallet funding are easy to conflate

- Expected: testnet GLM funds mutation gas; a Hub access key only raises RPC rate limits.
- Actual: the project exposes only `ARKIV_PRIVATE_KEY`. This may be sufficient with the public RPC, but it does not prove that the corresponding address has GLM.
- Reproduction: see <https://docs.arkiv.network/start-here/access-keys/> and <https://hub.arkiv.network/faucet>.
- Impact: startup credential detection cannot establish that writes will succeed; balance must be checked separately.

### 10. Faucet operational details are incomplete in the static docs

- Expected: a reproducible CLI/API funding procedure for a server wallet.
- Actual: funding is described as connecting a wallet to the Hub faucet and claiming once per cooldown; the published page does not specify a transfer API, faucet amount, or cooldown duration.
- Impact: a private key used only by a server may need to be imported into a compatible wallet or funded by the Arkiv desk. The exact desk request is the derived address plus Tiramisu testnet GLM.

### 11. Entity Explorer deep-link format is undocumented

- Expected: a documented stable URL for a particular entity.
- Actual: the docs link to <https://data.arkiv.network> but do not document an entity-key URL pattern.
- Impact: the demo can always print the entity key and transaction explorer URL; an entity deep link must be verified before it is presented as stable.

### 12. Query operators advertised by the SDK are not all supported by the network

- Expected: exported operators work against the documented public network.
- Actual: the querying guide says `ne`, `exists`, and `hasType` are exported but not currently supported by the network.
- Impact: the mandate query must use supported equality/system-attribute filters and rely on Arkiv's live-only query surface.

## 2026-09-12 — ETHRome MCP inspection

### 13. The ETHRome MCP is reference-only, not an Arkiv data-plane client

- Expected from a phrase such as "MCP access" or "help your agent build and query": an MCP tool might execute entity mutations or database queries.
- Actual: `tools/list` on `https://arkiv-mcp-gateway.vercel.app/ethrome` exposes 15 documentation, workflow, validation, package/skill-discovery, feedback, and model-generation tools. It exposes no `createEntity`, `getEntity`, or entity-query execution tool. Server initialization says retrieved content is untrusted reference data and must never be authorization.
- Reproduction: initialize the Streamable HTTP endpoint, call `tools/list`, and inspect server version `1.0.23`.
- Impact: the MCP cannot replace the gateway's Arkiv adapter. It can supply current guidance and reviewed recipes, while the gateway must perform its own signed writes and direct public-client queries.

### 14. The MCP neither accepts keys nor handles signing or funding

- Expected: if the MCP performed writes, it would need a signing/funding model.
- Actual: the server instructions state that it never receives private keys or signs. `get_workflow(name: "model_entities")` returns local wallet/local-env instructions; execution remains in the developer's local process. `network_status` says faucet funding and CAPTCHA are human steps and that the signing wallet's balance must be checked locally.
- Impact: `ARKIV_PRIVATE_KEY` must remain in this gateway's local environment, and its derived Tiramisu address must be funded with GLM. Sending it to the MCP would be both unnecessary and contrary to the MCP's instructions.

### 15. The ETHRome MCP's supported profile is SDK 0.8.0, not the gateway's 0.7.0

- Expected from the current ETHRome integration profile: `npm install @arkiv-network/sdk@0.8.0 viem`, using the built-in `tiramisu` chain, typed attributes, `expires`, and the current query builder.
- Actual: this gateway pins `@arkiv-network/sdk` to `0.7.0`, imports the retired `braga` chain, passes array attributes and `expiresIn`, and has no public query client.
- Reproduction: compare `network_status` and `get_workflow(name: "model_entities")` from the ETHRome MCP with `package.json` and `src/adapters/live/arkiv.ts`.
- Impact: using MCP guidance without upgrading would produce code that does not type-check against the installed SDK. The supported implementation path is SDK 0.8.0 for runtime plus the MCP only as a reference source.

### 16. The current mandate attribute name is invalid under the documented Tiramisu rules

- Expected: attribute names begin with a lowercase letter and contain only lowercase letters, digits, `.`, `-`, or `_`; the docs recommend snake case.
- Actual: the adapter writes `agentId`, which contains an uppercase `I`.
- Reproduction: compare the attribute-name rules in the current mutating-data guide with `src/adapters/live/arkiv.ts`.
- Impact: the live Tiramisu entity should use `agent_id`; the query must use the identical typed name and value.

### 17. Current official pages are inconsistent about the SDK generation

- Expected: all current pages use the same Tiramisu SDK API.
- Actual: the current installation and mutating-data pages show the 0.8-style built-in `tiramisu` chain, typed attribute map, `expires`, and `ExpirationTime` from the package root. The fundamentals page still describes 0.7-style array attributes, `expiresIn` seconds, and `ExpirationTime` from `/utils`.
- Impact: the ETHRome MCP's pinned 0.8.0 source/profile is the safer implementation reference than mixing examples across official pages. This inconsistency is documentation friction, not evidence that the MCP can execute the code.

### 18. The linked Data Explorer is not currently verified for Tiramisu

- Expected: the documentation's Entity Explorer link provides evidence for current Tiramisu entities.
- Actual: MCP `network_status` reports that its dated DOM check found only Braga and Kaolin in the Data Explorer network menu. It recommends the keyless SDK/RPC for current entity queries; the Tiramisu block explorer's entity-history URL is history, not proof that the entity remains queryable.
- Impact: mandate proof must include the direct query result and block number. Explorer links are supplementary evidence only.

### 19. Faucet funding is not visible on the Tiramisu RPC

- Expected: the configured `ARKIV_PRIVATE_KEY` derives `0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf`, which was reported funded with Tiramisu GLM.
- Actual: the key derives the expected address and the RPC reports chain ID `7738577`, but both viem and a raw `eth_getBalance` request returned zero at blocks `348119` through `348128`. `eth_getTransactionCount` also returned zero.
- Reproduction: call `eth_getBalance` with address `0x5b64003476d76dd22fa78b01d2eb8b3d078b9daf` and block tag `latest` on `https://rpc.tiramisu.db-chain.testnet.arkiv.network`; the result on 2026-09-12 was `0x0`.
- Impact: a real `createEntity` transaction cannot pay gas. Per the integration stop rule, no SDK upgrade or live-write implementation was attempted until the Arkiv desk confirms funding is finalized and visible on this RPC.

### 20. Faucet funding appeared only after a second confirmation

- Expected: the first funding confirmation would be visible through the official Tiramisu RPC.
- Actual: the first verification remained at `0 GLM`; after the faucet was run again, the same address reported `0.1 GLM` at block `348871`.
- Reproduction: compare `eth_getBalance` for `0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf` before and after the second faucet confirmation.
- Impact: builders should verify the balance through the target RPC rather than treating the faucet UI as final write readiness.

### 21. SDK 0.8.0 is a breaking migration, not a chain-name-only change

- Expected from the ETHRome MCP: pin `@arkiv-network/sdk@0.8.0` and use its Tiramisu profile.
- Actual in the prior adapter: 0.7.0's Braga import, array attributes, `expiresIn`, untyped values and write-only client all required replacement. The 0.8.0 query builder also requires at least one predicate and typed values that exactly match stored types.
- Impact: the adapter now uses the built-in `tiramisu` chain, snake_case typed attributes, `ExpirationTime`, a separate public client and immutable `$creator` filtering. Mixing any remaining 0.7 example back into this path will fail type-checking or query incorrectly.

### 22. Exact three-field privacy conflicts with the usual project attribute recommendation

- Expected from Arkiv best practices: every shared-database entity normally carries a project/type namespace attribute.
- Actual requirement for this mandate: the only application attributes permitted are `agent_id`, `expiry`, and `commitment`.
- Resolution: the read path restricts every result with immutable `$creator` and then matches the locally recorded entity key and commitment. No fourth project attribute is added.
- Impact: this is safe for the single trusted backend writer but makes creator-address stability part of the public verification contract.

### 23. Vitest does not load the repository `.env` for the live integration test

- Expected: `npm run test` would expose the repository's funded `ARKIV_PRIVATE_KEY` to a test that deliberately exercises the live client.
- Actual: the initial integration test saw no value in `process.env`, even though runtime scripts load the same `.env` successfully.
- Reproduction: read `process.env.ARKIV_PRIVATE_KEY` in a Vitest file without an explicit environment load.
- Resolution: the integration test calls Node's `loadEnvFile()` without logging the value and still fails closed if the key is absent.

### 24. MCP schema validation recognizes phrasing, not only semantics

- Expected: `check_schema` would recognize the existing entity table, query expression and "What remains off-chain" section.
- Actual: its shallow text check reported seven warnings because it did not recognize an entity-type heading, a literal SDK query-builder call, the off-Arkiv wording, Why Arkiv, or the preferred Entity Expiration/Lifetime Extension vocabulary.
- Reproduction: submit the first version of `arkiv/schema.md` to `check_schema` on ETHRome MCP server `1.0.23`.
- Resolution: the schema now includes the literal query-builder call and explicit headings/terms. The implementation was not changed in response to these text-recognition warnings.

### 25. `check_schema` vocabulary warning is triggered by unrelated Web2/local-store nouns

- Expected: using the exact product terms "Arkiv entities" and "Arkiv entity" would satisfy the vocabulary check even while contrasting Arkiv with a Web2 row or describing a local gateway record.
- Actual: MCP server `1.0.23` continued to say `Use the product term "Arkiv entities"` until the unrelated words `row` and `record` were removed from the schema's Web2 and local-store explanations.
- Reproduction: submit the schema with those nouns, then replace them with `state`, `stored mandate`, and `idempotency keys`; the final `check_schema` result has no findings.
- Impact: this is a shallow vocabulary heuristic rather than a schema defect. The wording workaround is harmless, but the original warning did not identify the triggering text.

### 26. `check_submission` requires external URLs absent from this checkout

- Expected: the repository review could validate the Mission 02 implementation and evidence locally.
- Actual: the shallow checker also requires a public GitHub repository URL and a deployed dapp URL. This checkout has no Git remote, Vercel metadata or deployment URL to verify.
- Reproduction: submit `README.md`, `arkiv/schema.md` and `package.json` to `check_submission` before publication.
- Impact: the mission heading and live evidence can be fixed locally; publishing a repository or deployment is an external action and no URL may be invented.

### 27. Tiramisu entity history and live query evidence agree

- Result: final SDK 0.8.0 code created entity `0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f` in transaction `0x91262da1e7d7aa80c82d20b9f635dbc27448d6d6154452ecc2db4d77a0cc7126`, with `$expiresAt = 349781`.
- Before expiry: the live query found it at block `349722`.
- After expiry: the same query returned an empty list at block `349784`; the gateway refused and recorded zero completed signing-capable actions.
- A prior proof's historical inspection at its creation block returned exactly the three application attributes `agent_id`, `commitment` and `expiry`, plus an empty payload and Arkiv system metadata.

### 28. `check_submission` requires legacy-template labels to recognize Mission 02 evidence

- Expected: the checker would recognize the explicit lifetime in blocks, before/after block heights, same-query outputs, natural-expiration statement and gateway refusal under the selected Mission 02 section.
- Actual: after the README contained all of those fields, MCP server `1.0.23` still reported that the mission block had no before/after evidence and did not state a lifetime in blocks.
- Reproduction: submit the current `README.md`, `arkiv/schema.md` and `package.json` to `check_submission`; compare its Mission 02 findings with the `Mission 02 before/after evidence` subsection.
- Workaround: `arkiv/submission.md` repeats the evidence in a flat block using the preserved legacy template's exact `what changes`, `lifetime used`, and `evidence` labels. The Mission 02 findings then clear. This changes documentation only; the checker still marks application verification as provisional and does not replace judging.
- Additional reproduction: when several repository files are concatenated, the checker evaluates the first mission-shaped block. Placing the canonical submission index first clears the Mission 02 findings; placing the README first reports them again. The MCP also rejects a combined text over its documented 20,000-character limit, so the schema must be checked separately.
