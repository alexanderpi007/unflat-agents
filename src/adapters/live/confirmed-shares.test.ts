import { expect, it, vi } from "vitest";
import { confirmedShares } from "./confirmed-shares";

it("keeps raw receipt evidence when optional decimals fail", async () => {
  const lookup = vi.fn().mockRejectedValue(new Error("over rate limit"));
  expect(await confirmedShares(961301103141262720n, lookup)).toEqual({
    sharesReceived: "unavailable", sharesReceivedRaw: "961301103141262720", shareDecimals: null,
  });
});

it("formats confirmed shares when decimals are available", async () => {
  expect(await confirmedShares(961301103141262720n, async () => 18)).toEqual({
    sharesReceived: "0.96130110314126272", sharesReceivedRaw: "961301103141262720", shareDecimals: 18,
  });
});
