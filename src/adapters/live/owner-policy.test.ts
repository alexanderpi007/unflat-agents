import { expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData, erc20Abi, erc4626Abi, type Abi } from "viem";
import { canonicalUsdc, ownerSignerPolicy } from "./owner-policy";

const vault = `0x${"2".repeat(40)}` as const;
const wallet = `0x${"3".repeat(40)}` as const;
const policy = ownerSignerPolicy("did:privy:owner", [{ id: "vault", address: vault, label: "Test", execution: "direct-morpho" }]);
type Request = { method: string; to?: string; value?: string; chain_id?: string; data?: `0x${string}`; domain?: Record<string, string> };
// Test double for Privy's documented deny-first/default-deny evaluation, not live policy evidence.
function allows(request: Request) {
  const matches = policy.rules.filter(rule => (rule.method === request.method || rule.method === "*") && rule.conditions.every(condition => {
    let value: unknown;
    try {
      if (condition.field_source === "ethereum_transaction") value = request[condition.field as keyof Request];
      else if (condition.field_source === "ethereum_typed_data_domain") value = request.domain?.[condition.field];
      else if (condition.field_source === "ethereum_calldata") {
        const abi = condition.abi as Abi;
        const decoded = decodeFunctionData({ abi, data: request.data! });
        if (condition.field === "function_name") value = decoded.functionName;
        else {
          const [name, argument] = condition.field.split(".");
          if (decoded.functionName !== name) return false;
          const fn = abi.find(item => item.type === "function" && item.name === name);
          if (!fn || fn.type !== "function") return false;
          value = decoded.args?.[fn.inputs.findIndex(input => input.name === argument)];
        }
      }
      return condition.operator === "eq" ? value === condition.value : Array.isArray(condition.value) && (condition.value as unknown[]).includes(String(value));
    } catch { return false; }
  }));
  return !matches.some(rule => rule.action === "DENY") && matches.some(rule => rule.action === "ALLOW");
}
const tx = (to: string, data: `0x${string}`): Request => ({ method: "eth_sendTransaction", to: to.toLowerCase(), data, chain_id: "8453", value: "0" });

it("allows only the intended Base USDC and vault functions for the gateway signer", () => {
  const transfer = tx(canonicalUsdc, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [wallet, 50_000n] }));
  const approve = tx(canonicalUsdc, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, 1_000_000n] }));
  const deposit = tx(vault, encodeFunctionData({ abi: erc4626Abi, functionName: "deposit", args: [1_000_000n, wallet] }));
  const redeem = tx(vault, encodeFunctionData({ abi: erc4626Abi, functionName: "redeem", args: [1n, wallet, wallet] }));
  for (const valid of [transfer, approve, deposit, redeem]) expect(allows(valid)).toBe(true);
  for (const invalid of [
    { ...transfer, chain_id: "1" }, { ...transfer, value: "1" }, { ...transfer, to: wallet },
    tx(canonicalUsdc, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [wallet, 1_000_000n] })),
    { ...deposit, to: wallet }, { ...redeem, to: wallet }, { ...transfer, data: "0x12345678" as const },
    { ...transfer, method: "eth_signTransaction" }, { method: "exportPrivateKey" }, { method: "exportSeedPhrase" }, { method: "personal_sign" }, { method: "earn_deposit" },
  ]) expect(allows(invalid)).toBe(false);
  expect(policy.owner).toEqual({ user_id: "did:privy:owner" });
});

it("only permits typed data for canonical USDC on Base", () => {
  const request = { method: "eth_signTypedData_v4", domain: { chainId: "8453", verifyingContract: canonicalUsdc.toLowerCase() } };
  expect(allows(request)).toBe(true);
  expect(allows({ ...request, domain: { ...request.domain, chainId: "1" } })).toBe(false);
  expect(allows({ ...request, domain: { ...request.domain, verifyingContract: wallet } })).toBe(false);
  expect(allows({ method: "eth_signTypedData_v4" })).toBe(false);
});
