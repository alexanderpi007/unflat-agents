import type { AgentAccount } from "./types";

// Called inside the same store lock as the claim. Failed provisioning still costs a slot.
export function checkEnrollmentLimit(accounts: AgentAccount[], incoming: AgentAccount) {
  if (!incoming.enrollmentIpHash) return; // Owner-authenticated provisioning is not anonymous enrollment.
  const cutoff = Date.parse(incoming.createdAt) - 3_600_000;
  const recent = accounts.filter(a => a.enrollmentIpHash && Date.parse(a.createdAt) > cutoff);
  if (recent.filter(a => a.enrollmentIpHash === incoming.enrollmentIpHash).length >= 5 || recent.length >= 10) {
    throw new Error("REFUSED — enrollment rate limit: 5 new accounts per IP per hour, 10 total per hour. Wait one hour; do not retry now.");
  }
}
