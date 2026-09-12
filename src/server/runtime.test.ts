import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryGatewayStore } from "@/core/store";
import { aimorganFeeWaivedLabel } from "@/core/labels";
import { createApplicationRuntime } from "./runtime";

const adapterKeys = ["privy", "aiMorgan", "arkiv", "swarm", "ens"] as const;

afterEach(() => vi.unstubAllEnvs());

describe("per-adapter runtime resolution", () => {
  it("MOCK_MODE mocks money but keeps funded Arkiv and browser Swarm", () => {
    vi.stubEnv("MOCK_MODE", "true");
    vi.stubEnv("ARKIV_PRIVATE_KEY", `0x${"01".repeat(32)}`);

    const result = createApplicationRuntime({ store: new MemoryGatewayStore() });

    expect(result.health.globalMockOverride).toBe(true);
    expect(result.health.adapters.privy.mode).toBe("mock");
    expect(result.health.adapters.aiMorgan.mode).toBe("mock");
    expect(result.health.adapters.arkiv.mode).toBe("live");
    expect(result.health.adapters.swarm.mode).toBe("browser");
    const offline = createApplicationRuntime({ fullyMocked: true, store: new MemoryGatewayStore() });
    for (const key of adapterKeys) expect(offline.health.adapters[key].mode).toBe("mock");
  });

  it("keeps configured Privy live while missing site adapters fall back", () => {
    vi.stubEnv("MOCK_MODE", "false");
    vi.stubEnv("AIMORGAN_X402", "false");
    vi.stubEnv("EARN_VIA_PRIVY", "true");
    vi.stubEnv("PRIVY_APP_ID", "test-app");
    vi.stubEnv("PRIVY_APP_SECRET", "test-secret");
    vi.stubEnv("PRIVY_AUTHORIZATION_PRIVATE_KEY", "test-authorization-key");
    vi.stubEnv("PRIVY_POLICY_ID", "test-policy");
    vi.stubEnv("BASE_RPC_URL", "https://base.example");
    vi.stubEnv(
      "UNFLAT_VAULT_ALLOWLIST",
      '[{"id":"vault","address":"0x0000000000000000000000000000000000000001","label":"test"}]',
    );
    vi.stubEnv("ARKIV_PRIVATE_KEY", "");
    vi.stubEnv("ENSV2_REGISTRAR_URL", "");

    const result = createApplicationRuntime({ store: new MemoryGatewayStore() });

    expect(result.health.adapters.privy.mode).toBe("live");
    expect(result.health.adapters.aiMorgan.mode).toBe("live");
    expect(result.health.adapters.aiMorgan.detail).toContain(aimorganFeeWaivedLabel);
    expect(result.health.adapters.arkiv.mode).toBe("mock");
    expect(result.health.adapters.swarm.mode).toBe("browser");
    expect(result.health.adapters.ens.mode).toBe("mock");
  });

  it("exposes the AIMorgan x402 path only when the flag is true", () => {
    vi.stubEnv("MOCK_MODE", "false");
    vi.stubEnv("AIMORGAN_X402", "true");

    const result = createApplicationRuntime({ store: new MemoryGatewayStore() });

    expect(result.health.adapters.aiMorgan).toEqual({
      mode: "live",
      detail: "Public external service at https://aimorgan.net; x402 enabled.",
    });
  });

  it("falls back instead of throwing for invalid present configuration", () => {
    vi.stubEnv("MOCK_MODE", "false");
    vi.stubEnv("PRIVY_APP_ID", "test-app");
    vi.stubEnv("PRIVY_APP_SECRET", "test-secret");
    vi.stubEnv("PRIVY_AUTHORIZATION_PRIVATE_KEY", "test-authorization-key");
    vi.stubEnv("PRIVY_POLICY_ID", "test-policy");
    vi.stubEnv("BASE_RPC_URL", "not-a-url");
    vi.stubEnv("UNFLAT_VAULT_ALLOWLIST", "not-json");

    expect(() => createApplicationRuntime({ store: new MemoryGatewayStore() })).not.toThrow();
    expect(createApplicationRuntime({ store: new MemoryGatewayStore() }).health.adapters.privy.mode).toBe("mock");
  });
});
