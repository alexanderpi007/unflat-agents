import { join } from "node:path";
import { isAddress } from "viem";
import { SigningGateway } from "@/core/gateway";
import { FakeClock, SystemClock } from "@/core/clock";
import { FileGatewayStore } from "@/core/file-store";
import { MemoryGatewayStore } from "@/core/store";
import type { Clock, Dependencies, GatewayStore } from "@/core/ports";
import type { AdapterHealth, EarnExecution, HexAddress, RuntimeHealth, VaultConfig } from "@/core/types";
import { aimorganFeeWaivedLabel } from "@/core/labels";
import {
  MockAiMorgan,
  MockArkiv,
  MockEns,
  MockPreflight,
  MockStatementStorage,
  MockVaultRate,
  MockWallet,
  MockX402,
} from "@/adapters/mock";
import { AiMorganRestAdapter } from "@/adapters/live/aimorgan";
import { ArkivMandateAdapter } from "@/adapters/live/arkiv";
import { EnsV2RegistrarAdapter } from "@/adapters/live/ens";
import { ReadOnlyEnsAdapter } from "@/adapters/live/ens-readonly";
import { BaseEarnPreflightAdapter } from "@/adapters/live/preflight";
import { PrivyWalletAdapter } from "@/adapters/live/privy";
import { MorphoVaultRateAdapter } from "@/adapters/live/morpho";
import { OwnerBrowserStatementStorage } from "@/adapters/live/swarm";
import { HttpX402Adapter } from "@/adapters/live/x402";

export const demoVault: VaultConfig = {
  id: "morpho-steakhouse-prime-usdc",
  address: "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9",
  label: "Steakhouse Prime USDC",
  execution: "direct-morpho",
};

const demoPrivyVault: VaultConfig = {
  id: "mock-privy-earn-vault",
  address: "0x0000000000000000000000000000000000000001",
  label: "Mock Privy Earn wrapper",
  execution: "privy-earn-api",
};

const mockStatus = (detail: string): AdapterHealth => ({ mode: "mock", detail });
const liveStatus = (detail: string): AdapterHealth => ({ mode: "live", detail });
const value = (name: string) => process.env[name]?.trim() || undefined;

function missing(names: string[]): string[] {
  return names.filter((name) => !value(name));
}

function mockReason(forceMock: boolean, absent: string[]): string {
  return forceMock
    ? "Forced by MOCK_MODE=true."
    : `Missing configuration: ${absent.join(", ")}.`;
}

function parseVaults(raw: string): VaultConfig[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("UNFLAT_VAULT_ALLOWLIST must be a non-empty JSON array.");
  }
  return parsed.map((entry) => {
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      typeof item.address !== "string" ||
      !isAddress(item.address)
    ) {
      throw new Error("Each vault needs a Privy vault ID, EVM address, and label.");
    }
    const execution: EarnExecution = item.execution === "direct-morpho"
      || item.address.toLowerCase() === demoVault.address.toLowerCase()
      ? "direct-morpho"
      : "privy-earn-api";
    if (item.execution !== undefined && item.execution !== "privy-earn-api" && item.execution !== "direct-morpho") {
      throw new Error("Vault execution must be privy-earn-api or direct-morpho.");
    }
    return { id: item.id, address: item.address, label: item.label, execution };
  });
}

function configuredVaults(): VaultConfig[] {
  const raw = value("UNFLAT_VAULT_ALLOWLIST");
  if (!raw) return [demoVault];
  try {
    return parseVaults(raw);
  } catch {
    return [demoVault];
  }
}

function resolvePrivy(forceMock: boolean, earnViaPrivy: boolean) {
  const names = [
    "PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "PRIVY_AUTHORIZATION_PRIVATE_KEY",
    "PRIVY_POLICY_ID",
    "UNFLAT_VAULT_ALLOWLIST",
    "BASE_RPC_URL",
  ];
  const absent = missing(names);
  if (forceMock || absent.length) {
    return {
      wallet: new MockWallet(),
      preflight: new MockPreflight(),
      vaults: configuredVaults(),
      status: mockStatus(mockReason(forceMock, absent)),
    };
  }

  try {
    const vaults = parseVaults(value("UNFLAT_VAULT_ALLOWLIST")!);
    const requiredExecution = earnViaPrivy ? "privy-earn-api" : "direct-morpho";
    if (!vaults.some((vault) => vault.execution === requiredExecution)) {
      throw new Error(`Vault allowlist has no ${requiredExecution} entry for the selected Earn path.`);
    }
    new URL(value("BASE_RPC_URL")!);
    return {
      wallet: new PrivyWalletAdapter(
        value("PRIVY_APP_ID")!,
        value("PRIVY_APP_SECRET")!,
        value("PRIVY_AUTHORIZATION_PRIVATE_KEY")!,
        value("PRIVY_POLICY_ID")!,
        value("BASE_RPC_URL")!,
        value("PRIVY_SESSION_SIGNER_ID"),
      ),
      preflight: new BaseEarnPreflightAdapter(value("BASE_RPC_URL")!),
      vaults,
      status: liveStatus(
        `Privy credentials, Base RPC, and ${earnViaPrivy ? "Privy Earn" : "direct Morpho"} vault allowlist configured.`,
      ),
    };
  } catch (error) {
    return {
      wallet: new MockWallet(),
      preflight: new MockPreflight(),
      vaults: [demoVault],
      status: mockStatus(`Invalid Privy configuration: ${error instanceof Error ? error.message : "unknown error"}`),
    };
  }
}

function resolveAiMorgan(forceMock: boolean, x402Enabled: boolean) {
  if (forceMock) {
    return { adapter: new MockAiMorgan(), status: mockStatus("Forced by MOCK_MODE=true.") };
  }
  return {
    adapter: new AiMorganRestAdapter("https://aimorgan.net"),
    status: liveStatus(x402Enabled
      ? "Public external service at https://aimorgan.net; x402 enabled."
      : `${aimorganFeeWaivedLabel}.`),
  };
}

function resolveArkiv(forceMock: boolean, clock: Clock) {
  const absent = missing(["ARKIV_PRIVATE_KEY"]);
  if (forceMock || absent.length) {
    return { adapter: new MockArkiv(clock), status: mockStatus(mockReason(forceMock, absent)) };
  }
  try {
    return {
      adapter: new ArkivMandateAdapter(value("ARKIV_PRIVATE_KEY")! as `0x${string}`),
      status: liveStatus("Arkiv SDK 0.8.0 signer and public query client configured for Tiramisu (eip155:7738577)."),
    };
  } catch (error) {
    return {
      adapter: new MockArkiv(clock),
      status: mockStatus(`Invalid Arkiv configuration: ${error instanceof Error ? error.message : "unknown error"}`),
    };
  }
}

function resolveSwarm(forceMock: boolean) {
  return forceMock
    ? { adapter: new MockStatementStorage(), status: mockStatus("CLI mock publication only; browser Swarm ID connects separately.") }
    : {
        adapter: new OwnerBrowserStatementStorage(),
        status: { mode: "browser" as const, detail: "Owner connects Swarm ID in the browser. The server never receives the encrypted reference." },
      };
}

function resolveEns(forceMock: boolean, mockMoney: boolean) {
  const rpc = value("SEPOLIA_RPC_URL");
  if (!forceMock && rpc && (process.env.VERCEL || !value("ENS_DEPLOYER_PRIVATE_KEY"))) {
    try {
      new URL(rpc);
      return { adapter: new ReadOnlyEnsAdapter(rpc, mockMoney),
        status: liveStatus("ENSv2 Sepolia LIVE · read-only resolution. No ENS signer; public runs never change ENS records.") };
    } catch {
      return { adapter: new MockEns(), status: mockStatus("Invalid Sepolia RPC configuration.") };
    }
  }
  const absent = missing(["ENS_DEPLOYER_PRIVATE_KEY", "SEPOLIA_RPC_URL"]);
  if (forceMock || absent.length) {
    return { adapter: new MockEns(), status: mockStatus(mockReason(forceMock, absent)) };
  }
  try {
    new URL(value("SEPOLIA_RPC_URL")!);
    return {
      adapter: new EnsV2RegistrarAdapter(value("ENS_DEPLOYER_PRIVATE_KEY")! as `0x${string}`, value("SEPOLIA_RPC_URL")!, value("ENS_GATEWAY_PRIVATE_KEY") as `0x${string}` | undefined),
      status: liveStatus(value("ENS_GATEWAY_PRIVATE_KEY")
        ? "ENSv2 Sepolia contracts configured; distinct gateway signer and independent resolve-back."
        : "ENSv2 Sepolia reads configured; ENS_GATEWAY_PRIVATE_KEY required for writes (no deployer fallback)."),
    };
  } catch (error) {
    return {
      adapter: new MockEns(),
      status: mockStatus("Invalid ENS key or RPC configuration; no signing enabled."),
    };
  }
}

export interface GatewayRuntime {
  gateway: SigningGateway;
  health: RuntimeHealth;
  deps: Omit<Dependencies, "wallet" | "ens">;
}

export function createApplicationRuntime(options: { clock?: Clock; store?: GatewayStore; mockMoney?: boolean; fullyMocked?: boolean } = {}): GatewayRuntime {
  const globalMockOverride = !!options.fullyMocked || !!process.env.VERCEL || (options.mockMoney ?? value("MOCK_MODE") === "true");
  const clock = options.clock ?? new SystemClock();
  const aiMorganX402 = !globalMockOverride && value("AIMORGAN_X402") === "true";
  const earnViaPrivy = !globalMockOverride && value("EARN_VIA_PRIVY") === "true";
  const privy = resolvePrivy(globalMockOverride, earnViaPrivy);
  const aiMorgan = resolveAiMorgan(globalMockOverride, aiMorganX402);
  const arkiv = resolveArkiv(!!options.fullyMocked, clock);
  const swarm = resolveSwarm(!!options.fullyMocked);
  const ens = resolveEns(!!options.fullyMocked, globalMockOverride);
  const deps: Dependencies = {
    store: options.store ?? (process.env.VERCEL ? new MemoryGatewayStore() : new FileGatewayStore(
      value("GATEWAY_STORE_PATH") ?? join(process.cwd(), ".data", "gateway.json"),
    )),
    clock,
    wallet: privy.wallet,
    ens: ens.adapter,
    arkiv: arkiv.adapter,
    x402: globalMockOverride || privy.status.mode === "mock" ? new MockX402() : new HttpX402Adapter(),
    aiMorgan: aiMorgan.adapter,
    preflight: privy.preflight,
    vaultRate: options.fullyMocked ? new MockVaultRate() : new MorphoVaultRateAdapter(),
    statementStorage: swarm.adapter,
    vaultAllowlist: privy.vaults,
    earnViaPrivy,
    aiMorganX402,
    demoPaymentRecipient: isAddress(value("DEMO_PAYMENT_RECIPIENT") ?? "")
      ? value("DEMO_PAYMENT_RECIPIENT") as HexAddress
      : globalMockOverride ? "0x000000000000000000000000000000000000dEaD" : undefined,
  };
  const { wallet: signingWallet, ens: signingIdentity, ...nonSigningDeps } = deps;
  return {
    deps: nonSigningDeps,
    gateway: new SigningGateway(deps),
    health: {
      globalMockOverride,
      adapters: {
        privy: privy.status,
        aiMorgan: aiMorgan.status,
        arkiv: arkiv.status,
        swarm: swarm.status,
        ens: ens.status,
      },
    },
  };
}

export function createMockRuntime(
  clock: Clock = new SystemClock(),
  seededWallet?: { walletId: string; address: HexAddress },
  aiMorganX402 = false,
  earnViaPrivy = false,
) {
  const store = new MemoryGatewayStore();
  const wallet = new MockWallet(seededWallet);
  const aiMorgan = new MockAiMorgan();
  const x402 = new MockX402();
  const statementStorage = new MockStatementStorage();
  const preflight = new MockPreflight();
  const deps: Dependencies = {
    store,
    clock,
    wallet,
    ens: new MockEns(),
    arkiv: new MockArkiv(clock),
    x402,
    aiMorgan,
    preflight,
    vaultRate: new MockVaultRate(),
    statementStorage,
    vaultAllowlist: [demoVault, demoPrivyVault],
    earnViaPrivy,
    aiMorganX402,
    demoPaymentRecipient: "0x000000000000000000000000000000000000dEaD",
  };
  return { gateway: new SigningGateway(deps), deps, wallet, x402, aiMorgan, preflight, statementStorage };
}

export function createDemoRuntime(seededWallet?: { walletId: string; address: HexAddress }) {
  return createMockRuntime(new FakeClock(new Date()), seededWallet);
}

declare global {
  var unflatRuntime: GatewayRuntime | undefined;
}

export const runtime: GatewayRuntime = globalThis.unflatRuntime?.deps ? globalThis.unflatRuntime : createApplicationRuntime();
if (process.env.NODE_ENV !== "production") globalThis.unflatRuntime = runtime;
