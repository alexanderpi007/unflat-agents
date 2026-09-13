import type { PrivyClient } from "@privy-io/node";
import { isAddress } from "viem";
import type { WalletPort } from "@/core/ports";
import { ownerSignerPolicy } from "./owner-policy";
import { assertFujiPolicy } from "./fuji-policy";

export async function pregenerateOwnerWallet(client: PrivyClient, signerId: string | undefined, input: Parameters<WalletPort["createOwnerWallet"]>[0]) {
  if (!signerId) throw new Error("PRIVY_SESSION_SIGNER_ID is required. No app-owned fallback.");
  const fujiPolicyId = input.chain === "avalanche-fuji" ? process.env.PRIVY_FUJI_POLICY_ID?.trim() : undefined;
  if (input.chain === "avalanche-fuji" && !fujiPolicyId) throw new Error("PRIVY_FUJI_POLICY_ID must identify the owner's manually configured Fuji policy. No policy was created or changed.");
  const users = client.users();
  let user;
  try { user = await users.getByEmailAddress({ address: input.ownerEmail }); }
  catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    user = await users.create({ linked_accounts: [{ type: "email", address: input.ownerEmail }] }, { maxRetries: 0 });
  }
  if (!user.linked_accounts.some(a => a.type === "email" && a.address.toLowerCase() === input.ownerEmail)) throw new Error("Privy returned a different owner identity.");
  const policy = fujiPolicyId ? await client.policies().get(fujiPolicyId)
    : await client.policies().create({ ...ownerSignerPolicy(user.id, input.vaults), idempotency_key: `owner-policy:${input.accountId}` });
  if (fujiPolicyId) {
    if (policy.id !== fujiPolicyId || !policy.owner_id || policy.chain_type !== "ethereum") throw new Error("Configured Fuji policy is invalid.");
    assertFujiPolicy(policy);
    const owner = await client.keyQuorums().get(policy.owner_id);
    if (owner.user_ids?.length !== 1 || owner.user_ids[0] !== user.id || owner.authorization_threshold !== 1
      || owner.authorization_keys.length || owner.key_quorum_ids?.length) throw new Error("Fuji policy must be owned solely by this Privy user. Configure it manually; the gateway will not change it.");
  }
  const externalId = `unflat_${input.accountId}`;
  await users.pregenerateWallets(user.id, { wallets: [{ chain_type: "ethereum", external_id: externalId,
    // Owner is unrestricted; only the additional signer gets the limited policy.
    policy_ids: [], additional_signers: [{ signer_id: signerId, override_policy_ids: [policy.id] }],
  }] }, { maxRetries: 0 });
  const wallets = await client.wallets().list({ external_id: externalId });
  if (wallets.data.length !== 1) throw new Error("Privy did not return exactly one new account wallet. Inspect before retrying.");
  const wallet = wallets.data[0];
  if (!wallet.owner_id || !policy.owner_id || wallet.chain_type !== "ethereum" || !isAddress(wallet.address)
    || wallet.external_id !== externalId || wallet.policy_ids.length !== 0 || wallet.additional_signers.length !== 1
    || wallet.additional_signers[0].signer_id !== signerId
    || wallet.additional_signers[0].override_policy_ids?.length !== 1
    || wallet.additional_signers[0].override_policy_ids[0] !== policy.id) throw new Error("Privy owner/delegation configuration did not match the requested wallet.");
  for (const ownerId of new Set([wallet.owner_id, policy.owner_id])) {
    const quorum = await client.keyQuorums().get(ownerId);
    if (quorum.user_ids?.length !== 1 || quorum.user_ids[0] !== user.id || quorum.authorization_threshold !== 1
      || quorum.authorization_keys.length || quorum.key_quorum_ids?.length) throw new Error("Wallet and policy must be solely user-owned, not server co-owned.");
  }
  return { walletId: wallet.id, address: wallet.address as `0x${string}`, ownership: {
    kind: "privy-user" as const, ownerEmail: input.ownerEmail, privyUserId: user.id, signerId, policyId: policy.id,
  } };
}
