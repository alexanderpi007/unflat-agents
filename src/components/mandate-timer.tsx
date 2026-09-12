"use client";

import { useEffect, useState } from "react";

export type TimerInput = {
  expiresAt?: string;
  confirmedExpired: boolean;
  running: boolean;
  unavailable: boolean;
  lastUpdateAt?: number;
};

// This is a display estimate only. It cannot authorize an action or confirm expiry.
export function timerView(input: TimerInput, now: number) {
  const deadline = input.expiresAt ? Date.parse(input.expiresAt) : NaN;
  const seconds = Number.isFinite(deadline) ? Math.max(0, Math.min(120, Math.ceil((deadline - now) / 1000))) : 120;
  const stale = input.running && !!input.lastUpdateAt && now - input.lastUpdateAt > 20_000;
  const state = input.confirmedExpired ? "EXPIRED"
    : input.unavailable || stale || (input.expiresAt && (!Number.isFinite(deadline) || !input.running)) ? "UNVERIFIED"
      : !input.expiresAt ? input.running ? "PREPARING" : "READY"
        : seconds === 0 ? "CHECKING" : "ACTIVE";
  const shown = state === "EXPIRED" ? 0 : seconds;
  return { state, seconds: shown, clock: state === "UNVERIFIED" || state === "PREPARING" ? "—:—"
    : `${Math.floor(shown / 60).toString().padStart(2, "0")}:${(shown % 60).toString().padStart(2, "0")}` };
}

export function useTimerView(props: TimerInput) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return timerView(props, now);
}

export function MandateTimer(props: TimerInput) {
  const view = useTimerView(props);
  const messages: Record<string, string> = {
    READY: "Two-minute duration. Starts when permission is granted.",
    PREPARING: "Preparing permission. The countdown has not started here yet.",
    ACTIVE: view.seconds <= 10 ? "About ten seconds or less remain. The gateway checks every action." : "Estimated time remaining. The gateway checks every action.",
    CHECKING: "Checking expiry… Waiting for the gateway’s confirmation.",
    EXPIRED: "Expiry confirmed. Permission has ended automatically.",
    UNVERIFIED: "Verification unavailable. Expiry is not confirmed here; the gateway still checks every action.",
  };
  return <div className={`mandate-timer timer-${view.state.toLowerCase()} ${view.state === "ACTIVE" && view.seconds <= 10 ? "timer-ending" : ""}`}>
    <div className="state-line"><i /><strong>{view.state}</strong></div>
    <div className="countdown" role="timer" aria-live="off" aria-label="Estimated permission time remaining">{view.clock}</div>
    <div className="time-track" aria-hidden="true"><i style={{ width: `${view.seconds / 120 * 100}%` }} /></div>
    <p role="status" aria-atomic="true">{messages[view.state]}</p>
    {view.state === "EXPIRED" && <a href="#refusal-result">See why the next action was refused ↓</a>}
  </div>;
}
