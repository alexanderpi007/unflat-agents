import { loadEnvFile } from "node:process";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { FileGatewayStore } from "../src/core/file-store";
import { exportLatestRealRun } from "../src/demo/export-real-run";
import type { DemoSnapshot } from "../src/core/types";

loadEnvFile();
const store = new FileGatewayStore(process.env.GATEWAY_STORE_PATH || ".data/gateway.json");
const runs: DemoSnapshot[] = [];
for (const agent of await store.listAgents()) {
  const mandate = await store.getMandate(agent.id);
  if (mandate) runs.push({ agent, mandate, events: await store.listEvents(agent.id) });
}
const exported = exportLatestRealRun(runs);
await mkdir("public", { recursive: true });
await writeFile("public/real-run.json.tmp", JSON.stringify(exported, null, 2) + "\n");
await rename("public/real-run.json.tmp", "public/real-run.json");
console.log(`${exported.label} · ${exported.snapshot.agent.displayName}: exported ${exported.snapshot.events.length} public events to public/real-run.json. No transactions sent.`);
