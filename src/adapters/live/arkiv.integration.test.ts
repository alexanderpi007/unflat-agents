import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { describe, expect, it } from "vitest";
import { ArkivMandateAdapter } from "./arkiv";
import { SystemClock } from "@/core/clock";
import { createMandateCommitment } from "@/core/mandate-commitment";
import { MandateService } from "@/core/mandates";
import { MemoryGatewayStore } from "@/core/store";
import type { HexHash, Mandate } from "@/core/types";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

describe("Arkiv live mandate authorization", () => {
  it("finds a real test entity, then refuses when Arkiv TTL removes it", async () => {
    const configuredKey = process.env.ARKIV_PRIVATE_KEY?.trim();
    if (!configuredKey) throw new Error("ARKIV_PRIVATE_KEY is required for the live Arkiv integration test.");
    const privateKey = (configuredKey.startsWith("0x") ? configuredKey : `0x${configuredKey}`) as HexHash;
    const arkiv = new ArkivMandateAdapter(privateKey);
    const store = new MemoryGatewayStore();
    const clock = new SystemClock();
    const agentId = randomUUID();
    const mandateId = randomUUID();
    const durationSeconds = 20;
    const expiry = new Date(Date.now() + durationSeconds * 1_000).toISOString();
    const opening = createMandateCommitment({
      mandateId,
      agentId,
      maxTotalUsdcCents: 105,
      maxPerActionUsdcCents: 100,
    });
    const entity = await arkiv.publishMandate({
      agentId,
      expiry,
      commitment: opening.commitment,
      durationSeconds,
    });
    const mandate: Mandate = {
      id: mandateId,
      agentId,
      ownerId: "owner:integration-test",
      allowedActions: ["usdc.transfer"],
      maxPerActionUsdcCents: 100,
      maxTotalUsdcCents: 105,
      spentUsdcCents: 0,
      startsAt: new Date().toISOString(),
      expiresAt: expiry,
      createdAt: new Date().toISOString(),
      arkivEntityKey: entity.entityKey,
      arkivTransactionHash: entity.transactionHash,
      arkivExplorerUrl: entity.explorerUrl,
      arkivExpiresAtBlock: entity.expiresAtBlock,
      arkivCommitment: entity.commitment,
    };
    await store.putMandate(mandate);
    await store.putMandateOpening(opening);
    const service = new MandateService(store, clock, arkiv);

    const before = await arkiv.findValidMandates(agentId);
    expect(before.found).toBe(true);
    expect(before.entities.map((candidate) => candidate.entityKey)).toContain(entity.entityKey);
    await expect(service.decide(agentId, "usdc.transfer", 5)).resolves.toMatchObject({ allowed: true });

    const deadline = Date.now() + 45_000;
    let after = before;
    while (after.found && Date.now() < deadline) {
      await delay(2_000);
      after = await arkiv.findValidMandates(agentId);
    }

    expect(after).toMatchObject({ found: false, entities: [] });
    await expect(service.decide(agentId, "usdc.transfer", 5)).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringContaining("Arkiv returned no matching unexpired entity"),
    });
  }, 60_000);
});
