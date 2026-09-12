import type { Mandate, StatementEvent } from "@/core/types";

// Presentation boundary only; never used for mandate authorization.
export function splitRunEvents(events: StatementEvent[], mandate?: Pick<Mandate, "createdAt">) {
  const start = mandate ? Date.parse(mandate.createdAt) : NaN;
  return {
    current: events.filter(event => Number.isFinite(start) && Date.parse(event.at) >= start),
    previous: events.filter(event => !Number.isFinite(start) || Date.parse(event.at) < start),
  };
}

export function mergeEventHistory(previous: StatementEvent[], current: StatementEvent[]) {
  return [...new Map([...previous, ...current].map(event => [event.id, event])).values()];
}
