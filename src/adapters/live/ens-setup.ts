import { randomBytes } from "node:crypto";
import { encodeFunctionData, erc20Abi, keccak256, parseAbi, parseEventLogs, toHex, zeroAddress, zeroHash } from "viem";
import type { Hex } from "viem";
import { EnsChain } from "./ens-chain";
import { allEnsRoles, ensContracts as C, factoryAbi, ownerNameRoles, registrarAbi, registryAbi, resolverAbi } from "./ens-contracts";

export async function setupEns(admin: EnsChain, gateway: Hex) {
  const c = admin.publicClient;
  const labelId = (s: string) => BigInt(keccak256(toHex(s)));
  const owner = admin.account.address;
  const txs: string[] = [];
  const write: EnsChain["write"] = async (...args) => {
    const r = await admin.write(...args); txs.push(r.transactionHash); return r;
  };
  async function proxy(implementation: Hex, data: Hex) {
    const receipt = await write(C.factory, factoryAbi, "deployProxy", [implementation, BigInt(toHex(randomBytes(32))), data]);
    const [event] = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: "ProxyDeployed" });
    if (!event) throw new Error("Factory receipt lacks ProxyDeployed.");
    return event.args.proxyAddress;
  }
  const available = await c.readContract({ address: C.registrar, abi: registrarAbi, functionName: "isAvailable", args: ["unflat"] });
  if (available) {
    const duration = 31_536_000n;
    await write(C.mockUsdc, parseAbi(["function mint(address,uint256)"]), "mint", [owner, 20_000_000n]);
    const [base, premium] = await c.readContract({ address: C.registrar, abi: registrarAbi, functionName: "getRegisterPrice", args: ["unflat", duration, C.mockUsdc] });
    await write(C.mockUsdc, erc20Abi, "approve", [C.registrar, base + premium]);
    const secret = toHex(randomBytes(32));
    const args = ["unflat", owner, secret, zeroAddress, zeroAddress, duration, zeroHash] as const;
    const commitment = await c.readContract({ address: C.registrar, abi: registrarAbi, functionName: "makeCommitment", args });
    const commit = await write(C.registrar, registrarAbi, "commit", [commitment]);
    const block = await c.getBlock({ blockNumber: commit.blockNumber });
    const age = await c.readContract({ address: C.registrar, abi: registrarAbi, functionName: "MIN_COMMITMENT_AGE" });
    console.info(`Commit mined; waiting for ${age}s of Sepolia block time.`);
    while ((await c.getBlock()).timestamp < block.timestamp + age) await new Promise(r => setTimeout(r, 5000));
    await write(C.registrar, registrarAbi, "register", [...args.slice(0, 6), C.mockUsdc, zeroHash]);
  }
  if ((await c.readContract({ address: C.ethRegistry, abi: registryAbi, functionName: "getOwner", args: [labelId("unflat")] })).toLowerCase() !== owner.toLowerCase()) {
    throw new Error("unflat.eth is not owned by the deployer; refusing to modify someone else's hierarchy.");
  }
  let root = await c.readContract({ address: C.ethRegistry, abi: registryAbi, functionName: "getSubregistry", args: ["unflat"] });
  if (root === zeroAddress) {
    root = await proxy(C.registryImpl, encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [owner, allEnsRoles] }));
    await write(root, registryAbi, "setParent", [C.ethRegistry, "unflat"]);
    await write(C.ethRegistry, registryAbi, "setSubregistry", [labelId("unflat"), root]);
  }
  let agents = await c.readContract({ address: root, abi: registryAbi, functionName: "getSubregistry", args: ["agents"] });
  let resolver = await c.readContract({ address: root, abi: registryAbi, functionName: "getResolver", args: ["agents"] });
  if (agents === zeroAddress) {
    agents = await proxy(C.registryImpl, encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [owner, allEnsRoles] }));
    resolver = await proxy(C.resolverImpl, encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [owner, allEnsRoles, []] }));
    const expiry = await c.readContract({ address: C.ethRegistry, abi: registryAbi, functionName: "getExpiry", args: [labelId("unflat")] });
    await write(root, registryAbi, "register", ["agents", owner, agents, resolver, ownerNameRoles, expiry]);
    await write(agents, registryAbi, "setParent", [root, "agents"]);
  }
  // Only child registration authority, not parent ownership or administrative roles.
  await write(agents, registryAbi, "grantRootRoles", [1n, gateway]);
  return { parent: "agents.unflat.eth", owner, gateway, rootRegistry: root, agentsRegistry: agents, resolver, transactions: txs };
}
