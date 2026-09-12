import { loadEnvFile } from "node:process";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { createApplicationRuntime } from "../src/server/runtime";
import { persistentAgentId, persistentWalletAddress } from "../src/demo/dashboard-run";

loadEnvFile(".env");
const runtime = createApplicationRuntime({ mockMoney: true });
if (runtime.health.adapters.ens.mode !== "live" || runtime.health.adapters.arkiv.mode !== "live") throw new Error("Live ENS and Arkiv required.");
const stored = await runtime.deps.store.getAgent(persistentAgentId);
if (stored?.walletAddress.toLowerCase() !== persistentWalletAddress.toLowerCase()) throw new Error("Persistent Privy wallet missing; no replacement created.");
const agent = await runtime.gateway.ensureAgentIdentity(persistentAgentId);
const mandate = await runtime.gateway.grantMandate({ agentId: agent.id, ownerId: "owner:demo", durationSeconds: 120,
  maxPerActionUsdcCents: 100, maxTotalUsdcCents: 105 });
const c = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL), cacheTime: 0 });
const records = Object.fromEntries(await Promise.all(["owner", "gateway", "mandate.commitment"].map(async key => [key, await c.getEnsText({ name: agent.ensName, key })])));
const state = await runtime.gateway.state(agent.id);
if (state.agent.ensResolvedAddress?.toLowerCase() !== persistentWalletAddress.toLowerCase() || records["mandate.commitment"] !== mandate.arkivCommitment) throw new Error("Resolve-back proof failed.");
console.log(JSON.stringify({ name: agent.ensName, registrationTx: agent.ensRegistrationTransaction,
  resolvedAddress: state.agent.ensResolvedAddress, explorer: state.agent.ensExplorerUrl, records,
  arkivEntity: mandate.arkivExplorerUrl, ensEvents: state.events.filter(e => e.action.startsWith("ens.")),
  money: "No Base transaction; existing Privy wallet reused." }, null, 2));
