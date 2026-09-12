import { describe, expect, it } from "vitest";
import committed from "../../public/real-run.json";
import { exportRealRun } from "./export-real-run";
import type { DemoSnapshot } from "@/core/types";

const snapshot = committed.snapshot as DemoSnapshot;
describe("public real-run export", () => {
  it("contains the requested LIVE proof and $0.15 remaining", () => {
    for (const action of ["usdc.transfer", "earn.approve", "earn.sweep"]) {
      expect(snapshot.events.find(e => e.action === action && e.status === "completed")?.reference).toMatch(/^0x[0-9a-f]{64}$/);
    }
    expect(snapshot.mandate.arkivEntityKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(snapshot.events.at(-1)?.reason).toMatch(/Arkiv returned no matching unexpired entity at block \d+/);
    expect(snapshot.mandate.maxTotalUsdcCents - snapshot.mandate.spentUsdcCents).toBe(15);
  });
  it("does not copy private fields or arbitrary log text", () => {
    const secret = "DO_NOT_PUBLISH_THIS_SECRET";
    const agent = { ...snapshot.agent, walletId: secret, secret, ownership: {
      kind: "privy-user" as const, ownerEmail: "private-owner@example.com", privyUserId: secret, signerId: secret, policyId: secret,
    } };
    const mandate = { ...snapshot.mandate, secret, opening: { secret }, ownerStatementKey: secret };
    const events = snapshot.events.map(e => e.action === "earn.sweep" ? { ...e, reason: e.reason + secret, secret } : e);
    const out = JSON.stringify(exportRealRun(agent, mandate, events));
    expect(out).not.toContain(secret);
    expect(out).not.toContain("ownerStatementKey");
    expect(out).not.toContain("statementReference");
    expect(out).not.toContain("private-owner@example.com");
    expect(out).not.toContain("ownership");
  });
  it("rejects incomplete and simulated runs", () => {
    expect(() => exportRealRun(snapshot.agent, snapshot.mandate, snapshot.events.slice(0, -1))).toThrow("complete LIVE");
    expect(() => exportRealRun(snapshot.agent, snapshot.mandate, snapshot.events.map(e => ({ ...e, reason: `MOCK MONEY ${e.reason}` })))).toThrow("complete LIVE");
  });
});
