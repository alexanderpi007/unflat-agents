import { describe, expect, it } from "vitest";
import nova from "../../public/real-runs/nova-2026-09-13.json";
import atlas from "../../public/real-runs/atlas-2026-09-12.json";
import audit from "../../docs/copy-audit-evidence.json";

describe.each([{ file: "nova-2026-09-13.json", run: nova }, { file: "atlas-2026-09-12.json", run: atlas }])("audited receipt attribution $file", ({ file, run }) => {
  it("binds every Base transaction and amount to its audited wallet and receipt", () => {
    for (const action of ["usdc.transfer", "earn.approve", "earn.sweep"]) {
      const event = run.snapshot.events.find(e => e.action === action && e.status === "completed")!;
      const proof = audit.checks.find(c => c.check === `${file} ${action}`)!.evidence as { hash: string; status: string; from: string; logs: { eventName: string; args: Record<string, string> }[] };
      expect(proof.hash).toBe(event.reference);
      expect(proof.status).toBe("success");
      expect(proof.from.toLowerCase()).toBe(run.snapshot.agent.walletAddress.toLowerCase());
      const name = action === "usdc.transfer" ? "Transfer" : action === "earn.approve" ? "Approval" : "Deposit";
      const args = proof.logs.find(log => log.eventName === name)!.args;
      expect(args.value ?? args.assets).toBe(action === "usdc.transfer" ? "50000" : "1000000");
      if (action === "earn.sweep") {
        expect(args.receiver.toLowerCase()).toBe(run.snapshot.agent.walletAddress.toLowerCase());
        expect(event.reason).toContain(`${args.shares} raw vault shares`);
      }
    }
  });
  it("binds the entity and 60-block expiry to the audited historical query", () => {
    const proof = audit.checks.find(c => c.check === `${file} Arkiv`)!.evidence as { lifetimeBlocks: string; historicalQuery: { before: { entities: { key: string; expiresAt: string }[] }; after: { entities: unknown[] } } };
    expect(proof.lifetimeBlocks).toBe("60");
    expect(proof.historicalQuery.before.entities[0].key).toBe(run.snapshot.mandate.arkivEntityKey);
    expect(proof.historicalQuery.before.entities[0].expiresAt).toBe(run.snapshot.mandate.arkivExpiresAtBlock);
    expect(proof.historicalQuery.after.entities).toEqual([]);
  });
});
