import { expect, it } from "vitest";
import type { StatementEvent } from "@/core/types";
import { mergeEventHistory, splitRunEvents } from "./run-events";

it("keeps only this mandate's events in the current story, including its ENS preparation", () => {
  const events = [
    { id: "old", at: "2026-09-11T12:00:00Z" },
    { id: "ens", at: "2026-09-12T12:00:01Z" },
    { id: "grant", at: "2026-09-12T12:00:02Z" },
    { id: "refusal", at: "2026-09-12T12:00:03Z" },
  ] as StatementEvent[];
  const split = splitRunEvents(events, { createdAt: "2026-09-12T12:00:00Z" });
  expect(split.current.map(event => event.id)).toEqual(["ens", "grant", "refusal"]);
  expect(split.previous.map(event => event.id)).toEqual(["old"]);
  expect(mergeEventHistory(events, events)).toHaveLength(4);
  expect(splitRunEvents(events).current).toEqual([]);
});
