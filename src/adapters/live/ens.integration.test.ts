import { loadEnvFile } from "node:process";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { expect, it } from "vitest";
import { persistentWalletAddress } from "@/demo/dashboard-run";

it("resolves the created ENSv2 Sepolia atlas identity and its records", async () => {
  loadEnvFile(".env");
  const c = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL), cacheTime: 0 });
  expect(await c.getChainId()).toBe(11155111);
  expect((await c.getEnsAddress({ name: "atlas.agents.unflat.eth" }))?.toLowerCase()).toBe(persistentWalletAddress.toLowerCase());
  expect(await c.getEnsText({ name: "atlas.agents.unflat.eth", key: "gateway" })).toBe("https://unflat-agents.vercel.app");
  expect(await c.getEnsText({ name: "atlas.agents.unflat.eth", key: "mandate.commitment" })).toMatch(/^0x[0-9a-f]{64}$/);
}, 30_000);
