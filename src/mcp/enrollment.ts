import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { GatewayRuntime } from "@/server/runtime";
import { tokenFingerprint } from "@/server/role-auth";

export const accountName = z.string().trim().toLowerCase().min(1).max(36)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "Use one ENS label: letters, digits and internal hyphens.");

export async function enroll(runtime: GatewayRuntime, input?: string, email?: string) {
  const parsed = accountName.safeParse(input);
  if (!parsed.success) throw new Error("REFUSED — enrollment requires get_account({name, owner_email}), one label of 1–36 letters/digits/internal hyphens.");
  const name = parsed.data;
  const parsedEmail = z.string().trim().toLowerCase().email().max(254).safeParse(email);
  if (!parsedEmail.success) throw new Error("REFUSED — enrollment requires the owner's owner_email. It determines who owns the wallet; verify it with the owner before funding.");
  const ownerEmail = parsedEmail.data;
  if (runtime.health.adapters.privy.mode === "live" && !process.env.PRIVY_SESSION_SIGNER_ID?.trim()) {
    throw new Error("REFUSED — PRIVY_SESSION_SIGNER_ID must be configured for owner-owned enrollment. No app-owned fallback.");
  }
  if (runtime.health.adapters.privy.mode === "live" && (runtime.health.adapters.ens.mode !== "live"
    || !process.env.ENS_DEPLOYER_PRIVATE_KEY || !process.env.ENS_GATEWAY_PRIVATE_KEY || !process.env.SEPOLIA_RPC_URL)) {
    throw new Error("REFUSED — new live accounts require the configured ENS signers and Sepolia RPC. No wallet was created.");
  }
  const { store } = runtime.deps;
  const id = randomUUID();
  const ownerId = await store.ensureOwnerId();
  const accountToken = `unflat_account_${randomBytes(32).toString("hex")}`;
  if (!await store.reserveAccount({ id, name, ownerId, ownerEmail, tokenHash: tokenFingerprint(accountToken),
    status: "provisioning", createdAt: runtime.deps.clock.now().toISOString() })) {
    throw new Error("REFUSED — name already reserved. Use that account's token; enrollment never retrieves tokens or replaces existing wallets. Atlas is reserved.");
  }
  let status: "ready" | "failed" = "ready";
  try {
    await runtime.gateway.getOrCreateAgent(id, name, ownerId, ownerEmail);
  } catch { status = "failed"; }
  await store.finishAccount(id, status);
  const agent = await store.getAgent(id);
  return { accountId: id, name: `${name}.agents.unflat.eth`, ownerId, status, accountToken,
    ownership: agent?.ownership?.kind ?? "provisioning-incomplete", ownerEmail,
    fundingAddress: agent?.walletAddress ?? null, network: "eip155:8453",
    ensRegistrationTransaction: agent?.ensRegistrationTransaction,
    moneyMode: runtime.health.adapters.privy.mode,
    detail: status === "ready"
      ? "Save accountToken privately now; it is returned once. Reconnect with it as your bearer token. The owner can fund this address with Base USDC and ETH for gas; spending still needs owner approval."
      : "Provisioning incomplete. Save this token; ask the owner to inspect the account. Do not fund or retry under another name. No automatic wallet/ENS retry." };
}
