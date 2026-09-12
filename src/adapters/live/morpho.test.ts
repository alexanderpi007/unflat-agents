import { afterEach, describe, expect, it, vi } from "vitest";
import { demoVault } from "@/server/runtime";
import { MorphoVaultRateAdapter } from "./morpho";

afterEach(() => vi.unstubAllGlobals());

describe("Morpho vault APY", () => {
  it("reads the allowlisted Base Vault V2 rate without substituting a number", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        chain_id: 8453,
        vault_address: demoVault.address,
        last_indexed_block: "51205110",
        lookback: "six_hours",
        apy: 0.04317912099241204,
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MorphoVaultRateAdapter().getRate(demoVault)).resolves.toMatchObject({
      apyBasisPoints: 432,
      provider: "Morpho",
      source: "morpho-api",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.morpho.org/v1/vaults-v2/8453:${demoVault.address}/apy-averages?lookback=six_hours`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when Morpho returns a different vault", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        chain_id: 8453,
        vault_address: "0x0000000000000000000000000000000000000001",
        lookback: "six_hours",
        apy: 0.04,
      },
    }), { status: 200 })));

    await expect(new MorphoVaultRateAdapter().getRate(demoVault)).rejects.toThrow(
      "did not match the allowlisted Base vault",
    );
  });
});
