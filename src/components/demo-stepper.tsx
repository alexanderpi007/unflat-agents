"use client";

import { useState } from "react";
import type { StatementEvent } from "@/core/types";
import { useTimerView, type TimerInput } from "./mandate-timer";

export function completedDemoSteps(events: StatementEvent[]) {
  const completed = (actions: string[]) => events.some(event => event.status === "completed" && actions.includes(event.action));
  return [completed(["agent.create", "ens.records", "ens.readonly"]), completed(["usdc.transfer"]), completed(["earn.sweep"])];
}

export function DemoStepper({ events, agentName = "Atlas", ...timer }: TimerInput & { events: StatementEvent[]; agentName?: string }) {
  const [named, paid, saved] = completedDemoSteps(events);
  const view = useTimerView(timer);
  const refused = timer.confirmedExpired && events.some(event => event.status === "refused");
  const waiting = !!timer.expiresAt && timer.running;
  const [dismissed, setDismissed] = useState(false);
  const steps = [
    { label: "NAME", complete: named, amount: "" },
    { label: "PAY", complete: paid, amount: "$0.05" },
    { label: "SAVE", complete: saved, amount: "$1.00" },
    { label: "EXPIRE", complete: refused, amount: "" },
  ];
  const end = refused ? "REFUSED" : view.state === "UNVERIFIED" ? "PAUSED" : waiting
    ? view.state === "CHECKING" ? "Checking…" : view.clock : "04";
  return <div className="progress-object">
    <ol className={`demo-stepper ${waiting && !refused ? "has-clock" : ""}`} aria-label="Demo progress">
    {steps.map((step, index) => <li key={step.label} className={`${step.complete ? "step-done" : ""} ${index === 3 && waiting ? "step-waiting" : ""} ${index === 3 && refused ? "step-refused" : ""}`}>
      <span className="step-label">{step.label}</span>
      <span className="step-node" aria-live="off">
        {index === 3 ? refused ? "×" : waiting ? "↓" : end : step.complete ? "✓" : `0${index + 1}`}
      </span>
      {index === 3 && waiting && !refused && <div className="hero-clock" aria-label="Estimated permission time remaining" role="timer" aria-live="off">
        <svg viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="116" /><circle className="clock-progress" cx="120" cy="120" r="116" pathLength="120" strokeDasharray="120" strokeDashoffset={120 - view.seconds} /></svg>
        <strong className={view.state !== "ACTIVE" ? "clock-message" : ""}>{view.state === "ACTIVE" ? view.clock : end}</strong>
        <span>{view.state === "ACTIVE" ? "UNTIL PERMISSION ENDS" : "AWAITING GATEWAY"}</span>
      </div>}
      <span className="step-amount">{step.amount || "\u00a0"}</span>
      <span className="visually-hidden">{index === 3 ? refused ? "Gateway confirmed refusal" : waiting ? "Estimated time; awaiting gateway confirmation" : "Awaiting expiry" : step.complete ? "Completed" : "Not completed"}</span>
    </li>)}
    </ol>
    {!timer.running && !refused && !events.length && <p className="demo-empty">Press run. Two minutes. Watch it stop.</p>}
    {refused && <div className={`hero-refused ${dismissed ? "banner-dismissed" : ""}`} role="status">
      <strong>REFUSED</strong><p>Time's up. {agentName} cannot spend under this mandate.</p>
      <button className="dismiss-refusal" aria-label="Dismiss refusal banner" onClick={() => setDismissed(true)}>×</button>
    </div>}
  </div>;
}
