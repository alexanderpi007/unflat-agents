import type { PrivyClient } from "@privy-io/node";
import { chainConfig } from "@/core/chains";

type Policy = Awaited<ReturnType<ReturnType<PrivyClient["policies"]>["get"]>>;

// Read-only validation of a policy created manually by the owner/operator. Never edit it here.
export function assertFujiPolicy(policy: Policy) {
  const allowed = policy.rules.filter(rule => rule.action === "ALLOW");
  const valid = allowed.length === 1 && allowed.every(rule => {
    const matches = (source: string, field: string, operator: string, value: string) => rule.conditions.some(c =>
      c.field_source === source && c.field === field && c.operator === operator
      && typeof c.value === "string" && (field === "to" ? c.value.toLowerCase() === value.toLowerCase() : c.value === value)
      && (source !== "ethereum_calldata" || ("abi" in c && Array.isArray(c.abi) && c.abi.some(item =>
        item && typeof item === "object" && "type" in item && item.type === "function" && "name" in item && item.name === "transfer"
        && "inputs" in item && Array.isArray(item.inputs) && item.inputs.length === 2
        && item.inputs[0]?.type === "address" && item.inputs[1]?.type === "uint256" && item.inputs[1]?.name === "amount"))));
    return rule.method === "eth_sendTransaction"
      && matches("ethereum_transaction", "chain_id", "eq", "43113")
      && matches("ethereum_transaction", "value", "eq", "0")
      && matches("ethereum_transaction", "to", "eq", chainConfig("avalanche-fuji").usdc)
      && matches("ethereum_calldata", "function_name", "eq", "transfer")
      && matches("ethereum_calldata", "transfer.amount", "lte", "1000000");
  });
  if (!valid) throw new Error("Configured Fuji policy must allow only chain 43113 Circle USDC transfer(), zero native value, and at most 1000000 raw USDC per transaction. Configure it manually; no policy was changed.");
}
