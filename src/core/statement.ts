import { randomBytes, webcrypto } from "node:crypto";
import type { Agent, Mandate, MandateCommitmentOpening, StatementEvent } from "./types";

export function createOwnerStatementKey(): string {
  return randomBytes(32).toString("base64url");
}

export async function encryptStatement(
  statement: {
    agent: Agent;
    mandate: Mandate;
    commitmentOpening?: MandateCommitmentOpening;
    events: StatementEvent[];
  },
  ownerKey: string,
): Promise<Uint8Array> {
  const rawKey = Buffer.from(ownerKey, "base64url");
  if (rawKey.byteLength !== 32) throw new Error("Owner statement key must contain 32 bytes.");

  const iv = randomBytes(12);
  const key = await webcrypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(statement));
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const envelope = JSON.stringify({
    version: 1,
    algorithm: "AES-256-GCM",
    iv: iv.toString("base64url"),
    ciphertext: Buffer.from(ciphertext).toString("base64url"),
  });
  return new TextEncoder().encode(envelope);
}
