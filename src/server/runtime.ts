import { SigningGateway } from "@/core/gateway";
import { FakeClock, SystemClock } from "@/core/clock";
import { MemoryGatewayStore } from "@/core/store";
import { FileGatewayStore } from "@/core/file-store";
import { join } from "node:path";
import type { Clock, Dependencies } from "@/core/ports";
import {
  MockAiMorgan,
  MockArkiv,
  MockEns,
  MockPreflight,
  MockStatementStorage,
  MockWallet,
  MockX402,
} from "@/adapters/mock";
import { isAddress } from "viem";
import { PrivyWalletAdapter } from "@/adapters/live/privy";
import { HttpX402Adapter } from "@/adapters/live/x402";
import { AiMorganRestAdapter } from "@/adapters/live/aimorgan";
import { ArkivMandateAdapter } from "@/adapters/live/arkiv";
import { EnsV2RegistrarAdapter } from "@/adapters/live/ens";
import { BaseEarnPreflightAdapter } from "@/adapters/live/preflight";
import { SwarmGatewayAdapter } from "@/adapters/live/swarm";
import type { HexAddress } from "@/core/types";

export const demoVault = {
  id: "unflat-privy-earn-usdc",
  address: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183" as const,
  label: "unflat USDC / Morpho on Base",
};

export function createMockRuntime(clock: Clock = new SystemClock()) {
  const store = new MemoryGatewayStore();
  const wallet = new MockWallet();
  const aiMorgan = new MockAiMorgan();
  const statementStorage = new MockStatementStorage();
  const deps: Dependencies = {
    store,
    clock,
    wallet,
    ens: new MockEns(),
    arkiv: new MockArkiv(),
    x402: new MockX402(),
    aiMorgan,
    preflight: new MockPreflight(),
    statementStorage,
    vaultAllowlist: [demoVault],
  };
  return { gateway: new SigningGateway(deps), deps, wallet, aiMorgan, statementStorage };
}

export function createDeterministicDemoRuntime() {
  return createMockRuntime(new FakeClock(new Date("2026-10-16T16:00:00.000Z")));
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when MOCK_MODE=false.`);
  return value;
}

function liveVaultAllowlist(): Array<{ id: string; address: HexAddress; label: string }> {
  const value = JSON.parse(required("UNFLAT_VAULT_ALLOWLIST")) as unknown;
  if (!Array.isArray(value) || value.length === 0) throw new Error("UNFLAT_VAULT_ALLOWLIST must be a non-empty JSON array.");
  return value.map((entry) => {
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      typeof item.address !== "string" ||
      !isAddress(item.address)
    ) {
      throw new Error("Each live vault needs a Privy vault id, EVM address, and label.");
    }
    return { id: item.id, address: item.address, label: item.label };
  });
}

function createLiveRuntime(): { gateway: SigningGateway } {
  const deps: Dependencies = {
    store: new FileGatewayStore(
      process.env.GATEWAY_STORE_PATH ?? join(process.cwd(), ".data", "gateway.json"),
    ),
    clock: new SystemClock(),
    wallet: new PrivyWalletAdapter(
      required("PRIVY_APP_ID"),
      required("PRIVY_APP_SECRET"),
      required("PRIVY_AUTHORIZATION_PRIVATE_KEY"),
      required("PRIVY_POLICY_ID"),
    ),
    ens: new EnsV2RegistrarAdapter(required("ENSV2_REGISTRAR_URL"), process.env.SEPOLIA_RPC_URL),
    arkiv: new ArkivMandateAdapter(required("ARKIV_PRIVATE_KEY") as `0x${string}`),
    x402: new HttpX402Adapter(),
    aiMorgan: new AiMorganRestAdapter("https://aimorgan.net"),
    preflight: new BaseEarnPreflightAdapter(required("BASE_RPC_URL")),
    statementStorage: new SwarmGatewayAdapter(
      required("SWARM_UPLOAD_URL"),
      required("SWARM_POSTAGE_BATCH_ID"),
    ),
    vaultAllowlist: liveVaultAllowlist(),
  };
  return { gateway: new SigningGateway(deps) };
}

declare global {
  var unflatRuntime: { gateway: SigningGateway } | undefined;
}

function createApplicationRuntime(): { gateway: SigningGateway } {
  if (process.env.MOCK_MODE === "false") return createLiveRuntime();
  const mock = createMockRuntime();
  return { gateway: mock.gateway };
}

export const runtime: { gateway: SigningGateway } =
  globalThis.unflatRuntime ?? createApplicationRuntime();
if (process.env.NODE_ENV !== "production") globalThis.unflatRuntime = runtime;
