import { expect, it, vi } from "vitest";
import { ReadOnlyEnsAdapter } from "./ens-readonly";

it("reuses only a resolved name with a matching wallet and discloses skipped writes", async () => {
  const reader = new ReadOnlyEnsAdapter("https://sepolia.example", true);
  const address = "0x0000000000000000000000000000000000000001";
  vi.spyOn(reader, "resolveIdentity").mockResolvedValue({ address, mode: "live", explorerUrl: "https://explorer.ens.dev/atlas.agents.unflat.eth" });
  expect(await reader.createIdentity("atlas", address)).toHaveProperty("name", "atlas.agents.unflat.eth");
  await expect(reader.createIdentity("atlas", "0x0000000000000000000000000000000000000002")).rejects.toThrow("existing name must resolve");
  expect((await reader.setMandateCommitment()).detail).toContain("ENS records were not changed");
});

it("cannot silently skip ENS record writes for real money", async () => {
  const reader = new ReadOnlyEnsAdapter("https://sepolia.example", false);
  await expect(reader.setMandateCommitment()).rejects.toThrow("local signing credentials");
});
