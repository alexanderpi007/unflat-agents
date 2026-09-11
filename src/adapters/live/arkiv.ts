import { createWalletClient, jsonToPayload } from "@arkiv-network/sdk";
import { braga } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ArkivPort } from "@/core/ports";
import type { Mandate } from "@/core/types";

export class ArkivMandateAdapter implements ArkivPort {
  private readonly client;

  constructor(privateKey: `0x${string}`) {
    this.client = createWalletClient({
      chain: braga,
      transport: http(),
      account: privateKeyToAccount(privateKey),
    });
  }

  async publishMandate(mandate: Mandate) {
    const secondsRemaining = Math.max(
      2,
      Math.ceil((new Date(mandate.expiresAt).getTime() - Date.now()) / 1_000 / 2) * 2,
    );
    const result = await this.client.createEntity({
      payload: jsonToPayload({
        mandateId: mandate.id,
        agentId: mandate.agentId,
        allowedActions: mandate.allowedActions,
        maxPerActionUsdcCents: mandate.maxPerActionUsdcCents,
        maxTotalUsdcCents: mandate.maxTotalUsdcCents,
        startsAt: mandate.startsAt,
        expiresAt: mandate.expiresAt,
      }),
      attributes: [
        { key: "project", value: "unflat-agents" },
        { key: "kind", value: "spending-mandate" },
        { key: "agentId", value: mandate.agentId },
      ],
      contentType: "application/json",
      expiresIn: secondsRemaining,
    });
    return { entityKey: result.entityKey };
  }
}

