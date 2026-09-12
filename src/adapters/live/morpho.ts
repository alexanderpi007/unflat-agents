import type { VaultRatePort } from "@/core/ports";
import type { EarnVaultRate, VaultConfig } from "@/core/types";

const morphoApiOrigin = "https://api.morpho.org";

interface MorphoApyResponse {
  data?: {
    chain_id?: number;
    vault_address?: string;
    last_indexed_block?: string;
    lookback?: string;
    apy?: number;
  };
}

export class MorphoVaultRateAdapter implements VaultRatePort {
  async getRate(vault: VaultConfig): Promise<EarnVaultRate> {
    const selector = `8453:${vault.address}`;
    const response = await fetch(
      `${morphoApiOrigin}/v1/vaults-v2/${selector}/apy-averages?lookback=six_hours`,
      { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) {
      throw new Error(`Morpho APY API returned HTTP ${response.status} for ${vault.address}.`);
    }
    const body = await response.json() as MorphoApyResponse;
    const data = body.data;
    if (
      data?.chain_id !== 8453
      || data.vault_address?.toLowerCase() !== vault.address.toLowerCase()
      || data.lookback !== "six_hours"
      || typeof data.apy !== "number"
      || !Number.isFinite(data.apy)
      || data.apy < 0
    ) {
      throw new Error("Morpho APY API returned data that did not match the allowlisted Base vault.");
    }
    return {
      apyBasisPoints: Math.round(data.apy * 10_000),
      provider: "Morpho",
      source: "morpho-api",
      detail: `Morpho Vault V2 realized six-hour average APY; last indexed block ${data.last_indexed_block ?? "unknown"}.`,
      asOf: new Date().toISOString(),
    };
  }
}
