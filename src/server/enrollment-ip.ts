import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { requireConfiguredRequest } from "./role-auth";

export function enrollmentIpHash(request: Request) {
  const { owner } = requireConfiguredRequest(request);
  // ngrok appends the connecting client last. Never trust a caller-supplied first hop.
  // A global store-backed ceiling also bounds provisioning if forwarding headers are forged.
  const last = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const ip = last && isIP(last) ? last.toLowerCase() : "unknown-direct-client";
  return createHmac("sha256", owner).update(ip).digest("hex");
}
