import { runDemo } from "../src/demo/run";

const { snapshot, steps } = await runDemo();

console.log("\nunflat × agents — deterministic end-to-end demo\n");
for (const [index, step] of steps.entries()) console.log(`${index + 1}. ${step}`);
console.log(`\nENS identity: ${snapshot.agent.ensName}`);
console.log(`Mandate spent: $${(snapshot.mandate.spentUsdcCents / 100).toFixed(2)} USDC`);
console.log(`Encrypted statement: ${snapshot.statementReference}`);
console.log("Owner decryption key generated locally for this run (not stored by the gateway).\n");

