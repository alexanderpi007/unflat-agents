"use client";

import { useState } from "react";
import type { DemoMoney } from "@/demo/dashboard-run";

export type DemoPlan = { recipient?: string; vault?: string };

export function DemoControls({ run, running, localLiveAvailable, plan }: {
  run: (mode: DemoMoney, confirmation?: string) => void; running: boolean;
  localLiveAvailable: boolean; plan?: DemoPlan;
}) {
  const [confirmation, setConfirmation] = useState("");
  return <>
    <button onClick={() => run("mock")} disabled={running}>Run MOCK money · real Arkiv →</button>
    <small>No Base funds move. Real two-minute Arkiv TTL; this is not accelerated.</small>
    {localLiveAvailable && <div>
      <p>LIVE Base mainnet: 0.05 USDC to {plan?.recipient ?? "recipient not configured"}; exact 1.00 USDC approval/deposit to {plan?.vault ?? "vault not configured"}. Total 1.05 USDC plus gas. AIMorgan fee waived.</p>
      <label htmlFor="live-confirm">Type CONFIRM for these transactions</label>
      <input id="live-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={running} />
      <button disabled={running || confirmation !== "CONFIRM" || !plan?.recipient || !plan.vault}
        onClick={() => { run("live", confirmation); setConfirmation(""); }}>Run LIVE (Base mainnet)</button>
    </div>}
  </>;
}
