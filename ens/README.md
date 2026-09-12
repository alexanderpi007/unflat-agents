# ENSv2: agent identity and delegated management

ENS is an authorization prerequisite, not a display string. `SigningGateway` resolves the name from Sepolia on action entry and again immediately before every financial signing reservation. Missing resolution, an RPC failure, or an address different from the stored Privy wallet produces a readable refusal before payment/signing. Arkiv remains the independent, uncached source of mandate existence; an ENS commitment does not extend an expired mandate.

## Ownership and roles

- Deployer: `0x097630f29ea1b08988A277eb18a8535C626Ed557` owns `unflat.eth`, `agents.unflat.eth` and the Atlas name tokens.
- Gateway: `0x7ea38A757e16EbD72C7163e5ca7791430d394b44`, a different private key, funded with 0.005 Sepolia ETH.
- On-chain gateway root roles: `.eth` registry = 0; `unflat.eth` registry = 0; `agents.unflat.eth` registry = 1 (`ROLE_REGISTRAR` only).
- Resolver gateway root roles = 0; Atlas name resource roles = 17 (`ROLE_SET_ADDR | ROLE_SET_TEXT`). No role-admin, transfer, parent-management, or resolver-upgrade permissions are granted to the gateway.
- Parent administration and per-name delegation use the deployer; agent-name registration and record writes use the gateway signer. There is no `setApprovalForAll` grant.

The owner-authorized Sepolia namespace setup and identity provisioning are control-plane operations, separate from agent financial actions (and make no Privy signing or Base call). Both enter through `SigningGateway`. The live runtime does not expose the ENS or financial signing adapters in its dependency view. Parent admin credentials remain present for authorizing each new name's record roles; this is not a production key-isolation service.

## Records and lifecycle

| Record | Value/source |
| --- | --- |
| Address (`addr`) | Agent's persistent Privy wallet |
| Text `owner` | Owner ID; defaults to `owner:demo` during provisioning, updated from mandate owner |
| Text `gateway` | `https://unflat-agents.vercel.app` |
| Text `mandate.commitment` | Actual keccak256 commitment from our Arkiv publication |

There is no current commitment before the first mandate: the text record is unset then. Granting a mandate publishes Arkiv, writes the commitment and owner to ENS, reads the commitment back, then enables the local accounting record. Amounts and commitment-opening secrets are never ENS records. After TTL expiry the historical commitment stays in ENS; only a live Arkiv query can authorize spending.

The dashboard reads resolution afresh through `gateway.state`, displays the resolved address and ENS explorer link, and links ENS statement entries to **Sepolia**, never BaseScan. The persistent wallet is reused when its old placeholder identity is provisioned. A conflicting name/address is refused rather than overwritten.

## Sepolia contracts

Chain ID: 11155111. RPC: `https://ethereum-sepolia-rpc.publicnode.com`.

| Contract | Address |
| --- | --- |
| ETHRegistrar | `0xa88553f454b77203b0d036a05c894d555eaaa2cc` |
| ETHRegistry | `0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2` |
| VerifiableFactory | `0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef` |
| UserRegistry implementation | `0x624a25d67b59d587752ebec8dded8827dae52050` |
| PermissionedResolver implementation | `0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e` |
| Our `unflat.eth` child registry | `0xAf4a8Dac197e410224563C3330190D52b7e42Acd` |
| Our `agents.unflat.eth` child registry | `0xFA8ac57Bec5421a2F62CDD774A62217f035a4C90` |
| Our PermissionedResolver proxy | `0xaE1b4c85aa0D93F20A6Ff29df6B19A2df45b70Ca` |
| ENS MockUSDC (6 decimals) | `0x768f42455a2d082e23ceef7d51e5787c82d67a39` |

Addresses and minimal ABIs follow [ENS deployments](https://docs.ens.domains/learn/deployments/), pinned source `contracts-v2@97a57293f3b4279d94b571e678edb53ce62638f4`. Reads use viem's canonical Universal Resolver, not a pinned resolver implementation.

## Live proof — 2026-09-12

1. [Mint 20 MockUSDC](https://sepolia.etherscan.io/tx/0x8722cd4d12d105e7d00244fd380359d31282cc29f81828aa2e1a4f42827b6aef).
2. [Approve exact 8.000021 MockUSDC](https://sepolia.etherscan.io/tx/0xde2f639ba8c10ed7f55626af9792076e151f501832aebc4c43951aed1cce78dc).
3. [Commit](https://sepolia.etherscan.io/tx/0x0cf37ca810feef785bd71e82b7cea580fdc64866ba29a14dbd4d487cf1cfec45), wait at least 60 seconds of mined block time, [register unflat.eth for one year](https://sepolia.etherscan.io/tx/0xc74ebb3c4319bb5f50f7ae48519e83fe45eadef5f08300a574042c39529281aa).
4. [Register agents.unflat.eth](https://sepolia.etherscan.io/tx/0x920ce198aa7e628bef0dcb3bedec2716e4fc3c7965afd9eb0dadcbdbc423dcee), [delegate child registration](https://sepolia.etherscan.io/tx/0xeb8a4f73b6c53eee09bb7afaa4b4b0d6dd3f764e7abe381c17484a4834fce420).
5. [Register atlas.agents.unflat.eth via gateway signer](https://sepolia.etherscan.io/tx/0xb3026ea2ad2d53cd463fbe47a3cfcda39c218d7f53b78a6836fc9a54adfaf5bf), [grant name-scoped record roles](https://sepolia.etherscan.io/tx/0x15696848e642e3389d200ee0dfa7fbc136509ca60236e158882b78ffd061df8b), [write address/owner/gateway](https://sepolia.etherscan.io/tx/0x4c73db21271d54d7f531d15728e5c4b784e86688bac92c2c55b4960d8d7a8b32).
6. [Write actual mandate commitment](https://sepolia.etherscan.io/tx/0xa7df8c7f43d9463860574f1b5a9fb76ebb2eef4d83769872277c253233b3fbb5) from [real Arkiv entity](https://tiramisu.explorer.arkiv.network/entity/0xe9d45c3df99cdf379c524b0d4250506d0e8210bfe52db5e61dbbb8c2702c3e6e).

Independent resolve-back output:

```json
{
  "name": "atlas.agents.unflat.eth",
  "registrationTx": "0xb3026ea2ad2d53cd463fbe47a3cfcda39c218d7f53b78a6836fc9a54adfaf5bf",
  "resolvedAddress": "0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7",
  "explorer": "https://explorer.ens.dev/atlas.agents.unflat.eth",
  "records": {
    "owner": "owner:demo",
    "gateway": "https://unflat-agents.vercel.app",
    "mandate.commitment": "0x1449cefc82ed516560c71ba4759dc59f24e7d858a2e25bf8e266531f6ed24aa5"
  }
}
```

No Base money moved for this proof; the existing Privy wallet was reused.

## Run and test

- `.env`: `ENS_DEPLOYER_PRIVATE_KEY`, `ENS_GATEWAY_PRIVATE_KEY`, `SEPOLIA_RPC_URL`. Never expose them with `NEXT_PUBLIC_`. Missing gateway key refuses writes rather than using the deployer for agent-name management.
- `npm run setup:ens`: **writes on Sepolia**, including mint/approve/commit/register if `unflat.eth` is available; checks parent ownership and connects registries. Intended for the owner, not an API route.
- `npm run demo:ens`: **writes on Sepolia and Tiramisu**, provisions the existing Atlas wallet's name if missing, grants a new 120-second mandate, writes/reads records and prints proof. Wait for any previous Arkiv mandate to expire first. No Base transactions.
- `npx vitest run src/adapters/live/ens.integration.test.ts`: read-only resolve-back test against the real created name.
- Gateway unit tests prove unresolvable and mid-action-disappearing names refuse without payment/signing.
- `npm run demo:mock`: completely mocked, including ENS. `MOCK_MODE=true` only mocks money; configured ENS remains live, like Arkiv.

The public deployment uses LIVE, read-only ENS with `SEPOLIA_RPC_URL` only. It resolves Atlas on initial load and during gateway checks; existing names may be reused only if they resolve to the expected wallet. It cannot register names or write records. Public mock-money mandates still use real Arkiv, with an explicit `ens.readonly` statement event explaining that their commitments were not published to ENS. A read-only adapter refuses real-money mandate grants rather than silently skipping required record writes. Vercel forces this keyless adapter even if ENS signing keys are accidentally configured; no ENS private keys were uploaded for this deployment.
