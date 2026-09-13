import { loadEnvFile } from "node:process";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { FileGatewayStore } from "../src/core/file-store";
import { exportRealRun, type RealRun } from "../src/demo/export-real-run";

loadEnvFile();
const store = new FileGatewayStore(process.env.GATEWAY_STORE_PATH || ".data/gateway.json");
// Only these owner-approved accounts are public; never publish every enrolled account.
const selections = [
  { id: "39086473-4800-45dc-9d1f-7c1a89f18273", file: "nova-2026-09-13.json", client: "Claude.ai" as const, date: "2026-09-13" },
  { id: "06b25dc5-51d0-4f23-8910-ee16bfad6bc0", file: "atlas-2026-09-12.json", client: "Claude Code" as const, date: "2026-09-12" },
];
const runs: { file: string; run: RealRun }[] = [];
for (const selection of selections) {
  const agent = await store.getAgent(selection.id);
  if (!agent) throw new Error(`Missing approved public account: ${selection.file}`);
  const mandate = await store.getMandate(agent.id);
  if (!mandate || !mandate.createdAt.startsWith(selection.date)) throw new Error(`Expected dated mandate for ${selection.file}; review the public selections before exporting a newer run.`);
  const run = exportRealRun(agent, mandate, await store.listEvents(agent.id));
  run.presentation = { ownerLabel: "Giacomo (email hidden)", client: selection.client,
    walletOwnership: agent.ownership?.kind === "privy-user" ? "owner-owned" : "app-owned (legacy)" };
  runs.push({ file: selection.file, run });
}
await mkdir("public/real-runs", { recursive: true });
for (const { file, run } of runs) {
  await writeFile(`public/real-runs/${file}.tmp`, JSON.stringify(run, null, 2) + "\n");
  await rename(`public/real-runs/${file}.tmp`, `public/real-runs/${file}`);
  console.log(`${run.label} · ${run.snapshot.agent.displayName} · ${run.presentation!.client}: ${run.snapshot.events.length} public events → public/real-runs/${file}`);
}
// Preserve the existing latest-run URL for viewers and tools that bookmarked it.
await writeFile("public/real-run.json.tmp", JSON.stringify(runs[0].run, null, 2) + "\n");
await rename("public/real-run.json.tmp", "public/real-run.json");
console.log("Latest run also exported to public/real-run.json. No transactions sent. No emails, secrets or tokens exported.");
