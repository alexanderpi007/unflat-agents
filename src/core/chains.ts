export type AccountChain = "base" | "avalanche-fuji";

export const accountChains = {
  base: {
    id: 8453, network: "eip155:8453", label: "Base mainnet", gasSymbol: "ETH", testnet: false,
    rpcUrl: "https://mainnet.base.org", explorerUrl: "https://basescan.org", proofLabel: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  "avalanche-fuji": {
    id: 43113, network: "eip155:43113", label: "Avalanche Fuji testnet", gasSymbol: "AVAX", testnet: true,
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc", explorerUrl: "https://testnet.snowtrace.io", proofLabel: "Fuji",
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
  },
} as const;

export function accountChain(value?: string): AccountChain {
  if (value === undefined || value === "base") return "base";
  if (value === "avalanche-fuji") return value;
  throw new Error("REFUSED — unsupported account chain; use base or avalanche-fuji.");
}

export function chainConfig(value?: string) { return accountChains[accountChain(value)]; }

// These two allowlisted Circle contracts must report 6 decimals in the independent preflight.
export function usdcAtomic(cents: number, decimals = 6): bigint {
  if (!Number.isSafeInteger(cents) || cents <= 0 || decimals !== 6) throw new Error("Invalid USDC amount or unexpected token decimals.");
  return BigInt(cents) * 10n ** BigInt(decimals - 2);
}
