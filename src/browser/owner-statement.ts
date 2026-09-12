import type { Agent, Mandate, StatementEvent } from "@/core/types";

export type StatementInput = {
  agent: Agent;
  mandate: Mandate;
  events: StatementEvent[];
  source: "mock-demo" | "gateway";
};

export function statementBytes(input: StatementInput): Uint8Array {
  const statement = {
    version: 1,
    source: input.source,
    exportedAt: new Date().toISOString(),
    agent: input.agent,
    mandate: input.mandate,
    events: input.events.filter((event) => event.action !== "statement.publish"),
  };
  return new TextEncoder().encode(JSON.stringify(statement, null, 2));
}

export function encryptedReference(value: string): string {
  const reference = value.trim();
  if (!/^[0-9a-fA-F]{128}$/.test(reference)) {
    throw new Error("Use the complete 128-character hex reference, including its decryption key.");
  }
  return reference;
}

export function plainStatement(data: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
