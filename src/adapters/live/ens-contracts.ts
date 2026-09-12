import { parseAbi } from "viem";

// ENS docs' Sepolia deployment: contracts-v2@97a57293f3b4279d94b571e678edb53ce62638f4.
export const ensContracts = {
  registrar: "0xa88553f454b77203b0d036a05c894d555eaaa2cc",
  ethRegistry: "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2",
  factory: "0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef",
  registryImpl: "0x624a25d67b59d587752ebec8dded8827dae52050",
  resolverImpl: "0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e",
  mockUsdc: "0x768f42455a2d082e23ceef7d51e5787c82d67a39",
} as const;
export const registryAbi = parseAbi([
  "function initialize(address,uint256)",
  "function getSubregistry(string) view returns(address)",
  "function getResolver(string) view returns(address)",
  "function getOwner(uint256) view returns(address)",
  "function getExpiry(uint256) view returns(uint64)",
  "function register(string,address,address,address,uint256,uint64) returns(uint256)",
  "function setSubregistry(uint256,address)",
  "function setParent(address,string)",
  "function grantRootRoles(uint256,address) returns(bool)",
  "function roles(uint256,address) view returns(uint256)",
]);
export const registrarAbi = parseAbi([
  "function isAvailable(string) view returns(bool)",
  "function getRegisterPrice(string,uint64,address) view returns(uint256,uint256)",
  "function MIN_COMMITMENT_AGE() view returns(uint64)",
  "function makeCommitment(string,address,bytes32,address,address,uint64,bytes32) pure returns(bytes32)",
  "function commit(bytes32)",
  "function register(string,address,bytes32,address,address,uint64,address,bytes32) returns(uint256)",
]);
export const resolverAbi = parseAbi([
  "function initialize(address,uint256,bytes[])",
  "function authorizeNameRoles(bytes,uint256,address,bool) returns(bool)",
  "function setAddr(bytes32,address)",
  "function setText(bytes32,string,string)",
  "function multicall(bytes[]) returns(bytes[])",
]);
export const factoryAbi = parseAbi([
  "function deployProxy(address,uint256,bytes) returns(address)",
  "event ProxyDeployed(address indexed sender,address indexed proxyAddress,uint256 salt,address implementation)",
]);
export const allEnsRoles = BigInt(`0x${"1".repeat(64)}`);
export const ownerNameRoles = (1n << 20n) | (1n << 24n) | (1n << 148n) | (1n << 152n) | (1n << 156n);
