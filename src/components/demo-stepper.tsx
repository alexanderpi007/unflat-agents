"use client";

import type { StatementEvent } from "@/core/types";
import { useTimerView, type TimerInput } from "./mandate-timer";

export function completedDemoSteps(events: StatementEvent[]) {
  const completed = (actions: string[]) => events.some(event => event.status === "completed" && actions.includes(event.action));
  return [completed(["agent.create", "ens.records", "ens.readonly"]), completed(["usdc.transfer"]), completed(["earn.sweep"])];
}

export function DemoStepper({ events, ...timer }: TimerInput & { events: StatementEvent[] }) {
  const [named, paid, saved] = completedDemoSteps(events);
  const view = useTimerView(timer);
  const refused = timer.confirmedExpired && events.some(event => event.status === "refused");
  const waiting = !!timer.expiresAt && timer.running;
  const steps = [
    { label: "NAME", complete: named, amount: "" },
    { label: "PAY", complete: paid, amount: "$0.05" },
    { label: "SAVE", complete: saved, amount: "$1.00" },
    { label: "EXPIRE", complete: refused, amount: "" },
  ];
  const end = refused ? "REFUSED" : view.state === "UNVERIFIED" ? "PAUSED" : waiting
    ? view.state === "CHECKING" ? "Checking…" : view.clock : "04";
  return <ol className="demo-stepper" aria-label="Demo progress">
    {steps.map((step, index) => <li key={step.label} className={`${step.complete ? "step-done" : ""} ${index === 3 && waiting ? "step-waiting" : ""} ${index === 3 && refused ? "step-refused" : ""}`}>
      <span className="step-label">{step.label}</span>
      <span className="step-node" role={index === 3 && waiting && !refused ? "timer" : undefined} aria-live="off">
        {index === 3 ? end : step.complete ? "✓" : `0${index + 1}`}
      </span>
      <span className="step-amount">{step.amount || "\u00a0"}</span>
      <span className="visually-hidden">{index === 3 ? refused ? "Gateway confirmed refusal" : waiting ? "Estimated time; awaiting gateway confirmation" : "Awaiting expiry" : step.complete ? "Completed" : "Not completed"}</span>
    </li>)}
  </ol>;
}
