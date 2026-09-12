# ENSv2 integration friction

Checked 2026-09-12 against [ENSv2 docs](https://docs.ens.domains/ensv2/overview/) and their pinned deployment artifacts at `ensdomains/contracts-v2@97a57293f3b4279d94b571e678edb53ce62638f4`.

- **Configured RPC fails:** `eth_chainId` against `https://rpc.sepolia.org/` returns HTTP 404 HTML. Expected Sepolia JSON-RPC. `https://ethereum-sepolia-rpc.publicnode.com` returns chain ID 11155111 and deployer balance 0.05 ETH. No key was sent to either endpoint.
- **Registrar was hypothetical:** `src/adapters/live/ens.ts` POSTs to `ENSV2_REGISTRAR_URL`. The documented flow instead calls deployed ETHRegistrar commit/register, UserRegistry and PermissionedResolver contracts. No registrar service is supplied by the project.
- **Parent ownership was assumed:** the old adapter hardcodes `agents.unflat.eth`. On-chain `ETHRegistrar.isAvailable("unflat")` returned true; this parent hierarchy does not yet belong to us. Registering `agents.unflat.eth` requires first obtaining `unflat.eth` and linking child registries, not passing a dotted label to ETHRegistrar.
- **Payment is not ENSv1 ETH rent:** ENSv2 takes ERC-20 payments; Sepolia ETH only pays gas. The registrar's live one-year quote for `unflat` with deployed MockUSDC was base 8000021 atomic units, premium 0; minimum duration 2419200 seconds. Query prices at execution time; the displayed $8/year is not an exact atomic quote.
- **Missing records and roles:** the adapter only checks an address after its HTTP request. It neither writes owner/gateway/mandate.commitment text records nor delegates ENSv2 roles. Parent ownership and limited gateway management need distinct principals; reusing the deployer key is not separation.
- **Commitment lifecycle:** agent creation precedes mandate grant in `SigningGateway`. There is no current Arkiv commitment at initial creation. It must be set when the mandate is published, never fabricated at registration.
- **Resolution is not itself a v1 bug:** current docs explicitly support `viem.getEnsAddress` on Sepolia through the canonical Universal Resolver proxy. Do not replace this with a pinned implementation address. The missing pieces are real registration, resolve-back display, and fail-closed action authorization.
- **Mock selection mismatch:** existing ENS selection uses `ENSV2_REGISTRAR_URL` and the money mock override. Required behavior uses deployer key + Sepolia RPC, with the fully offline demo explicitly mocked.
- **Explorer rendering:** `https://explorer.ens.dev` is reachable but its HTML text response is empty (client-rendered app); a successful HTTP response alone is not proof that a name is registered.

Sources: [deployments](https://docs.ens.domains/learn/deployments/), [registrar](https://docs.ens.domains/ensv2/eth-registrar/), [subnames](https://docs.ens.domains/ensv2/tutorial-contract-developers/), [resolver](https://docs.ens.domains/ensv2/permissioned-resolver/), [roles](https://docs.ens.domains/ensv2/enhanced-access-control/), [app integration](https://docs.ens.domains/ensv2/tutorial-app-developers/).

## Funding and payment verification

- Updated the ignored `.env` RPC to PublicNode and generated a separate gateway key there (file permissions 0600), as authorized. No key is recorded here.
- Gateway `0x7ea38A757e16EbD72C7163e5ca7791430d394b44` received exactly 0.005 Sepolia ETH from deployer `0x097630f29ea1b08988A277eb18a8535C626Ed557`: [successful funding transaction](https://sepolia.etherscan.io/tx/0x742f84cb94bf78ad37bbe59b28a36c50e352dbefd063b238cf52416839b34a6b), block 11688948; balance read back as 0.005 ETH.
- Oracle `0x8914b66260eb8c4fff795650c3ae8cd335958987` reports `isPaymentToken` true for BOTH ENS MockUSDC `0x768f42455a2d082e23ceef7d51e5787c82d67a39` and Circle Ethereum Sepolia USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`. The deployment table's MockUSDC entry is not an exhaustive accepted-token list.
- ETHRegistrar `getRegisterPrice("unflat", 31536000, CircleUSDC)` also succeeds: base 8000021, premium 0 (8.000021 USDC). Deployer balances for both tokens are currently zero. Registration has not been attempted.
- [Circle's faucet](https://faucet.circle.com) offers 20 USDC on Ethereum Sepolia; [Circle's contract table](https://developers.circle.com/stablecoins/usdc-contract-addresses) confirms the address above. Select Ethereum Sepolia, not Base Sepolia.
- The deployed ENS MockUSDC also exposes `mint(address,uint256)`; read-only simulation of minting 10 test tokens to the deployer succeeded. No mint transaction was sent. This is an alternative to the Circle faucet, not Circle-issued USDC.

## Implementation and live resolution

- The user subsequently authorized minting 20 MockUSDC and completing setup; it succeeded. Registration and role/record receipts are in [README.md](README.md). The earlier zero-token/paused observations above describe the pre-funding state, not the final state.
- A diagnostic call to `getRoles(uint256,address)` reverted because that is not the deployed public interface. The internal `_getRoles` described in the EAC docs must not be inferred as a public getter. The pinned deployment ABI exposes `roles(uint256,address)`, `hasRoles`, and `hasRootRoles`. Corrected the local ABI and verified root roles 0/0/1 and resolver root/name roles 0/17.
- Explorer is client-rendered; its served router bundle has `/$name`, confirming the direct link `https://explorer.ens.dev/atlas.agents.unflat.eth` (not an invented `/name/` route).
- A failed record-write after a successful name registration is a partial on-chain setup. The adapter refuses to overwrite a name whose existing resolution differs or is absent; such a partial setup needs owner inspection/repair rather than silently claiming successful registration. Multi-transaction setup is not atomic.
- Parent-admin credentials are still used to grant new name-scoped resolver roles. The gateway signer itself has no parent ownership/admin role; keeping both keys in the same hackathon server is not production-grade key isolation.
- ENS records persist after the Arkiv TTL. The commitment records the latest published mandate, not proof that it is still valid; the real Arkiv query remains mandatory.
- Deployment gap fixed: the original live adapter required a deployer key even for reading ENS. Added a separate keyless Sepolia reader, always selected on Vercel with `SEPOLIA_RPC_URL`. Public mock-money grants explicitly disclose that their new Arkiv commitment is not written into ENS; real-money grants cannot use this no-write path. The dashboard resolves the public identity on initial load without requiring access to the local gateway store.
