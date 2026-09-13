import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionFeed } from "./action-feed";
import type { StatementEvent } from "@/core/types";

const hash = `0x${"7".repeat(64)}`;
const event: StatementEvent = { id: "fuji-pay", agentId: "fuji", chain: "avalanche-fuji", action: "usdc.transfer",
  status: "completed", amountUsdcCents: 5, at: "2026-09-13T09:00:00.000Z", reference: hash, reason: "Confirmed Fuji transfer." };

it("Fuji payments use Snowtrace proof chips, never Base links", () => {
  const html = renderToStaticMarkup(<ActionFeed events={[event]} mockMoney={false} agentName="Fuji agent" />);
  expect(html).toContain(`href="https://testnet.snowtrace.io/tx/${hash}"`);
  expect(html).toContain("Fuji ↗");
  expect(html).toContain(`title="${hash}"`);
  expect(html).toContain("$0.05");
  expect(html).not.toContain("basescan");
  expect(html).not.toContain("Simulated:");
});

it("mock Fuji references are not public proofs and legacy Base links stay Base", () => {
  const mock = renderToStaticMarkup(<ActionFeed events={[{ ...event, reason: "MOCK SAFETY NET" }]} mockMoney={true} />);
  expect(mock).toContain("Simulated:"); expect(mock).not.toContain("snowtrace");
  const legacy = renderToStaticMarkup(<ActionFeed events={[{ ...event, chain: undefined }]} mockMoney={false} />);
  expect(legacy).toContain(`href="https://basescan.org/tx/${hash}"`);
  expect(legacy).not.toContain("snowtrace");
});
