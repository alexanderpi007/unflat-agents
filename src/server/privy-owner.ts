import { PrivyClient } from "@privy-io/node";

export async function verifyPrivyOwner(token: string) {
  const appId = process.env.PRIVY_APP_ID?.trim(), appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("Privy owner login is not configured.");
  const client = new PrivyClient({ appId, appSecret });
  const claims = await client.utils().auth().verifyAccessToken(token);
  const user = await client.users()._get(claims.user_id);
  if (user.id !== claims.user_id) throw new Error("Owner identity mismatch.");
  const emails = user.linked_accounts.filter(a => a.type === "email" && (a.verified_at ?? a.latest_verified_at ?? 0) > 0)
    .map(a => a.type === "email" ? a.address.trim().toLowerCase() : "");
  if (!emails.length) throw new Error("Verified Privy email login required.");
  return { userId: user.id, emails };
}
