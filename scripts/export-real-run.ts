import { loadEnvFile } from "node:process";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { FileGatewayStore } from "../src/core/file-store";
import { exportRealRun } from "../src/demo/export-real-run";

loadEnvFile();
const store = new FileGatewayStore(process.env.GATEWAY_STORE_PATH || ".data/gateway.json");
const agentId = "a7100000-0000-4000-8000-000000000001";
const agent = await store.getAgent(agentId);
const mandate = await store.getMandate(agentId);
if (!agent || !mandate) throw new Error("Persistent agent and completed mandate required.");
const exported = exportRealRun(agent, mandate, await store.listEvents(agentId));
await mkdir("public", { recursive: true });
await writeFile("public/real-run.json.tmp", JSON.stringify(exported, null, 2) + "\n");
await rename("public/real-run.json.tmp", "public/real-run.json");
console.log(`${exported.label}: exported ${exported.snapshot.events.length} public events to public/real-run.json. No transactions sent.`);
