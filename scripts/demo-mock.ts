import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
process.env.MOCK_MODE = "true";

const { runDemo } = await import("../src/demo/run");
const { health, privyProof, snapshot, steps } = await runDemo({ publishMockStatement: true });
const labels = { privy: "Privy", aiMorgan: "AIMorgan", arkiv: "Arkiv", swarm: "Swarm", ens: "ENS" } as const;
const entries = Object.entries(health.adapters) as Array<
  [keyof typeof labels, (typeof health.adapters)[keyof typeof health.adapters]]
>;

console.log("\nunflat × agents — MOCK safety-net demo\n");
console.log("Adapter modes");
for (const [key, status] of entries) console.log(`- ${labels[key]}: ${status.mode.toUpperCase()} — ${status.detail}`);
console.log("\nMock capability proof");
console.log(`- Wallet address: ${privyProof.walletAddress}`);
console.log(`- Wallet ID: ${privyProof.walletId}`);
console.log(`- Vault: ${privyProof.vaultLabel}`);
console.log(`- Vault APY: ${privyProof.apyBasisPoints == null ? "unavailable" : `${(privyProof.apyBasisPoints / 100).toFixed(2)}%`} (${privyProof.source}; no invented fallback)`);
console.log("\nAccelerated mandate scenario");
for (const [index, step] of steps.entries()) console.log(`${index + 1}. ${step}`);
console.log(`\nENS identity: ${snapshot.agent.ensName}`);
console.log(`Mandate spent: $${(snapshot.mandate.spentUsdcCents / 100).toFixed(2)} USDC`);
console.log(`Encrypted statement: ${snapshot.statementReference}`);
console.log("Owner decryption key generated locally for this run (not stored by the gateway).");
console.log("Demo footer — LIVE: none · MOCK: Privy, AIMorgan, Arkiv, Swarm, ENS");
console.log("Safety net only: no external wallet, x402, Earn, Arkiv, Swarm, or ENS call was made.\n");
