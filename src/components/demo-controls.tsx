"use client";

import { useState } from "react";
import type { DemoMoney } from "@/demo/dashboard-run";

export type DemoPlan = { recipient?: string; vault?: string };

export function OwnerControls({ run, running, plan }: {
  run: (mode: DemoMoney, confirmation?: string) => void; running: boolean;
  plan?: DemoPlan;
}) {
  const [confirmation, setConfirmation] = useState("");
  return <section className="owner-money-card" id="owner-money" aria-label="Owner money controls">
      <h2>Run with real money on Base</h2>
      <p>Total 1.05 USDC plus gas</p>
      <details><summary>Details</summary><p>Transfer 0.05 USDC to {plan?.recipient ?? "recipient not configured"}.</p><p>Approve exactly 1.00 USDC and deposit into {plan?.vault ?? "vault not configured"}. This scripted path requires free AIMorgan REST and direct Morpho execution.</p></details>
      <label htmlFor="live-confirm">Type CONFIRM for these transactions</label>
      <input id="live-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={running} />
      <button disabled={running || confirmation !== "CONFIRM" || !plan?.recipient || !plan.vault}
        onClick={() => { run("live", confirmation); setConfirmation(""); }}>Run LIVE (Base mainnet)</button>
  </section>;
}
