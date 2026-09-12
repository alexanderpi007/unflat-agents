import { formatUnits } from "viem";

// Decimals enrich display only; the Deposit receipt already proves the raw shares.
export async function confirmedShares(raw: bigint, readDecimals: () => Promise<number>) {
  try {
    const shareDecimals = await readDecimals();
    return { sharesReceived: formatUnits(raw, shareDecimals), sharesReceivedRaw: raw.toString(), shareDecimals };
  } catch {
    return { sharesReceived: "unavailable", sharesReceivedRaw: raw.toString(), shareDecimals: null };
  }
}
