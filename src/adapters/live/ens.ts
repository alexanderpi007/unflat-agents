import { createPublicClient, http, isAddress } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import type { EnsPort } from "@/core/ports";
import type { HexAddress } from "@/core/types";

export class EnsV2RegistrarAdapter implements EnsPort {
  private readonly publicClient;

  constructor(
    private readonly registrarUrl: string,
    sepoliaRpcUrl?: string,
  ) {
    this.publicClient = createPublicClient({ chain: sepolia, transport: http(sepoliaRpcUrl) });
  }

  async createIdentity(label: string, owner: HexAddress) {
    const name = normalize(`${label}.agents.unflat.eth`);
    const response = await fetch(this.registrarUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, owner, parent: "agents.unflat.eth", network: "sepolia" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`ENSv2 registrar failed with HTTP ${response.status}.`);
    const body = (await response.json()) as { transactionHash?: string; address?: string };
    const resolved = await this.publicClient.getEnsAddress({ name });
    if (!resolved || !isAddress(resolved) || resolved.toLowerCase() !== owner.toLowerCase()) {
      throw new Error("ENSv2 subname did not independently resolve to the agent wallet on Sepolia.");
    }
    return { name, reference: body.transactionHash ?? `ensv2:sepolia:${name}` };
  }
}

