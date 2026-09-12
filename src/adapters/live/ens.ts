import { encodeFunctionData, keccak256, namehash, toHex, zeroAddress, zeroHash, type Hex } from "viem";
import { normalize, packetToBytes } from "viem/ens";
import type { EnsPort } from "@/core/ports";
import { EnsChain } from "./ens-chain";
import { ensContracts as C, ownerNameRoles, registryAbi, resolverAbi } from "./ens-contracts";
import { setupEns } from "./ens-setup";

export class EnsV2RegistrarAdapter implements EnsPort {
  private readonly admin;
  private readonly manager;
  constructor(deployerKey: Hex, rpc: string, gatewayKey?: Hex) {
    this.admin = new EnsChain(deployerKey, rpc);
    this.manager = gatewayKey ? new EnsChain(gatewayKey, rpc) : undefined;
  }
  async setup() {
    if (!this.manager) throw new Error("ENS_GATEWAY_PRIVATE_KEY is required for delegated management.");
    if (this.manager.account.address === this.admin.account.address) throw new Error("ENS gateway and deployer must be distinct.");
    return setupEns(this.admin, this.manager.account.address);
  }
  private async namespace() {
    const c = this.admin.publicClient;
    const root = await c.readContract({ address: C.ethRegistry, abi: registryAbi, functionName: "getSubregistry", args: ["unflat"] });
    if (root === zeroAddress) throw new Error("ENS namespace not initialized; run npm run setup:ens.");
    const registry = await c.readContract({ address: root, abi: registryAbi, functionName: "getSubregistry", args: ["agents"] });
    const resolver = await c.readContract({ address: root, abi: registryAbi, functionName: "getResolver", args: ["agents"] });
    if (registry === zeroAddress || resolver === zeroAddress) throw new Error("ENS agents registry/resolver missing.");
    return { root, registry, resolver };
  }
  async createIdentity(label: string, wallet: Hex, ownerId = "owner:demo") {
    if (!this.manager) throw new Error("ENS_GATEWAY_PRIVATE_KEY is required; no deployer fallback signing.");
    const name = normalize(`${label}.agents.unflat.eth`);
    if (name.split(".").length !== 4) throw new Error("ENS agent label must be a single label.");
    const { root, registry, resolver } = await this.namespace();
    const c = this.admin.publicClient;
    const id = BigInt(keccak256(toHex(label)));
    const owner = await c.readContract({ address: registry, abi: registryAbi, functionName: "getOwner", args: [id] });
    if (owner !== zeroAddress) {
      const resolved = await this.resolveIdentity(name);
      if (owner.toLowerCase() !== this.admin.account.address.toLowerCase() || resolved.address?.toLowerCase() !== wallet.toLowerCase()) {
        throw new Error("ENS label already belongs to a different identity; refusing to overwrite.");
      }
      return { name, reference: resolved.explorerUrl, ...resolved };
    }
    const expiry = await c.readContract({ address: root, abi: registryAbi, functionName: "getExpiry", args: [BigInt(keccak256(toHex("agents")))] });
    const reference = (await this.manager.write(registry, registryAbi, "register", [label, this.admin.account.address, zeroAddress, resolver, ownerNameRoles, expiry])).transactionHash;
    await this.admin.write(resolver, resolverAbi, "authorizeNameRoles", [toHex(packetToBytes(name)), 17n, this.manager.account.address, true]);
    await this.manager.write(resolver, resolverAbi, "multicall", [[
      encodeFunctionData({ abi: resolverAbi, functionName: "setAddr", args: [namehash(name), wallet] }),
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [namehash(name), "owner", ownerId] }),
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [namehash(name), "mandate.commitment", zeroHash] }),
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [namehash(name), "gateway", "https://unflat-agents.vercel.app"] }),
    ]]);
    const resolved = await this.resolveIdentity(name);
    if (resolved.address?.toLowerCase() !== wallet.toLowerCase()) throw new Error("ENS resolve-back does not match the Privy wallet.");
    return { name, reference, ...resolved };
  }
  async setMandateCommitment(name: string, commitment: Hex, ownerId: string) {
    if (!this.manager) throw new Error("ENS gateway signer missing.");
    const { resolver } = await this.namespace();
    if (!normalize(name).endsWith(".agents.unflat.eth")) throw new Error("ENS name is outside our namespace.");
    const receipt = await this.manager.write(resolver, resolverAbi, "multicall", [[
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [namehash(name), "mandate.commitment", commitment] }),
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [namehash(name), "owner", ownerId] }),
    ]]);
    const value = await this.admin.publicClient.getEnsText({ name: normalize(name), key: "mandate.commitment" });
    if (value !== commitment) throw new Error("ENS commitment resolve-back failed.");
    return { reference: receipt.transactionHash };
  }
  async resolveIdentity(name: string) {
    const normalized = normalize(name);
    const address = await this.admin.publicClient.getEnsAddress({ name: normalized });
    return { address, explorerUrl: `https://explorer.ens.dev/${normalized}`, mode: "live" as const };
  }
}
