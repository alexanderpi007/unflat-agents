import { erc20Abi, erc4626Abi } from "viem";
import type { PrivyClient } from "@privy-io/node";
import type { VaultConfig } from "@/core/types";

export const canonicalUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
type PolicyCreateParams = Parameters<ReturnType<PrivyClient["policies"]>["create"]>[0];
type PolicyCondition = PolicyCreateParams["rules"][number]["conditions"][number];
type Rule = PolicyCreateParams["rules"][number];
const transaction = (field: "to" | "chain_id" | "value", value: string | string[], operator: "eq" | "in" = "eq"): PolicyCondition =>
  ({ field_source: "ethereum_transaction", field, operator, value });
const calldata = (field: string, value: string | string[], abi: typeof erc20Abi | typeof erc4626Abi, operator: "eq" | "in" = "eq"): PolicyCondition =>
  ({ field_source: "ethereum_calldata", field, operator, value, abi: JSON.parse(JSON.stringify(abi)) });

export function ownerSignerPolicy(userId: string, vaults: VaultConfig[]): PolicyCreateParams {
  const addresses = vaults.filter(v => v.execution === "direct-morpho").map(v => v.address.toLowerCase());
  if (!addresses.length) throw new Error("An allowlisted direct USDC vault is required for owner wallets.");
  const base = [transaction("chain_id", "8453"), transaction("value", "0")];
  const allow = (name: string, conditions: PolicyCondition[]): Rule =>
    ({ name, method: "eth_sendTransaction", action: "ALLOW", conditions: [...base, ...conditions] });
  return { name: "unflat owner wallet: limited Base signer", version: "1.0", chain_type: "ethereum",
    // The server must not be able to widen its own delegation by editing this policy.
    owner: { user_id: userId }, rules: [
      allow("Canonical USDC transfers", [transaction("to", canonicalUsdc.toLowerCase()), calldata("function_name", "transfer", erc20Abi)]),
      allow("USDC approval only to allowed vaults", [transaction("to", canonicalUsdc.toLowerCase()), calldata("function_name", "approve", erc20Abi), calldata("approve.spender", addresses, erc20Abi, "in")]),
      allow("Allowed vault deposit or redeem", [transaction("to", addresses, "in"), calldata("function_name", ["deposit", "redeem"], erc4626Abi, "in")]),
      { name: "USDC typed data only", method: "eth_signTypedData_v4", action: "ALLOW", conditions: [
        { field_source: "ethereum_typed_data_domain", field: "chainId", operator: "eq", value: "8453" },
        { field_source: "ethereum_typed_data_domain", field: "verifyingContract", operator: "eq", value: canonicalUsdc.toLowerCase() },
      ] },
      { name: "Never export through delegated signer", method: "exportPrivateKey", action: "DENY", conditions: [] },
      { name: "Never export seed through delegated signer", method: "exportSeedPhrase", action: "DENY", conditions: [] },
    ] };
}
