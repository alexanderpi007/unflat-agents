import { describe, expect, it } from "vitest";
import nova from "../../public/real-runs/nova-2026-09-13.json";
import atlas from "../../public/real-runs/atlas-2026-09-12.json";
import type { RealRun } from "./export-real-run";
import { exportRealRun } from "./export-real-run";
import { runStory } from "./run-story";

describe.each([nova, atlas] as RealRun[])("published $snapshot.agent.displayName run", run => {
  it("retells six completed decisions and does not invent missing ones", () => {
    const lines = runStory(run.snapshot);
    expect(lines).toHaveLength(6);
    expect(lines[0].text).toContain(run.snapshot.agent.ensName);
    expect(lines.at(-1)?.text).toContain("$0.15 left");
    expect(runStory({ ...run.snapshot, events: [] })).toEqual([]);
  });
  it("has real transaction proofs, one account and no private identity or credentials", () => {
    expect(() => exportRealRun(run.snapshot.agent, run.snapshot.mandate, run.snapshot.events)).not.toThrow();
    expect(run.snapshot.events.every(e => e.agentId === run.snapshot.agent.id)).toBe(true);
    const text = JSON.stringify(run);
    for (const key of ["ownerEmail", "account_token", "tokenHash", "signerId", "privyUserId", "privateKey", "opening", "statementReference"]) expect(text).not.toContain(`"${key}"`);
    expect(text).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]+/i);
    expect(run.presentation?.ownerLabel).toBe("Giacomo (email hidden)");
  });
});
