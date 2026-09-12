import { randomBytes } from "node:crypto";
import { encodeAbiParameters, keccak256 } from "viem";
import type { HexHash, MandateCommitmentOpening } from "./types";

export function createMandateCommitment(input: {
  mandateId: string;
  agentId: string;
  maxTotalUsdcCents: number;
  maxPerActionUsdcCents: number;
}): MandateCommitmentOpening {
  const secret = `0x${randomBytes(32).toString("hex")}` as HexHash;
  const encoded = encodeAbiParameters(
    [
      { name: "agent", type: "string" },
      { name: "cap", type: "uint256" },
      { name: "perActionCap", type: "uint256" },
      { name: "secret", type: "bytes32" },
    ],
    [input.agentId, BigInt(input.maxTotalUsdcCents), BigInt(input.maxPerActionUsdcCents), secret],
  );
  return {
    ...input,
    secret,
    commitment: keccak256(encoded),
  };
}
