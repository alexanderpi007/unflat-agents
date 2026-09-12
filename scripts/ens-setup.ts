import { loadEnvFile } from "node:process";
import { EnsV2RegistrarAdapter } from "../src/adapters/live/ens";
import { createMockRuntime } from "../src/server/runtime";

loadEnvFile(".env");
const adapter = new EnsV2RegistrarAdapter(process.env.ENS_DEPLOYER_PRIVATE_KEY as `0x${string}`, process.env.SEPOLIA_RPC_URL!, process.env.ENS_GATEWAY_PRIVATE_KEY as `0x${string}`);
// Owner-approved namespace setup is separate from agent money actions; enter through the gateway.
const runtime = createMockRuntime();
console.log(JSON.stringify(await runtime.gateway.setupIdentityNamespace(adapter), null, 2));
