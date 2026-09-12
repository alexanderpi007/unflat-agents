import { createPublicClient, http, type Hex } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import type { EnsPort } from "@/core/ports";

export class ReadOnlyEnsAdapter implements EnsPort {
  private readonly client;
  constructor(rpc: string, private readonly mockMoney: boolean) {
    this.client = createPublicClient({ chain: sepolia, transport: http(rpc), cacheTime: 0 });
  }
  async resolveIdentity(name: string) {
    const normalized = normalize(name);
    const address = await this.client.getEnsAddress({ name: normalized });
    return { address, mode: "live" as const, explorerUrl: `https://explorer.ens.dev/${normalized}` };
  }
  async createIdentity(label: string, wallet: Hex) {
    const name = normalize(`${label}.agents.unflat.eth`);
    const resolved = await this.resolveIdentity(name);
    if (resolved.address?.toLowerCase() !== wallet.toLowerCase()) {
      throw new Error("ENS read-only: existing name must resolve to this wallet; registration requires the local signer.");
    }
    return { name, reference: resolved.explorerUrl };
  }
  async setMandateCommitment() {
    if (!this.mockMoney) throw new Error("ENS record updates require local signing credentials before a real-money mandate can be granted.");
    return { detail: "ENS LIVE · read-only: Atlas was resolved from Sepolia. This mock-money run's new commitment is in Arkiv; ENS records were not changed. The ENS text record retains the last locally signed mandate commitment." };
  }
}
