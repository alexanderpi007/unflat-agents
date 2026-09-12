import { createHash, timingSafeEqual } from "node:crypto";

export const ownerModeAvailable = () => !process.env.VERCEL;
const digest = (value: string) => createHash("sha256").update(value).digest();
export const tokenFingerprint = (value: string) => digest(value).toString("hex");

export function sameBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && parsed.host === (request.headers.get("host") ?? new URL(request.url).host)
      && (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)));
  } catch { return false; }
}

export function requireConfiguredRequest(request: Request) {
  if (process.env.VERCEL) throw new Error("Owner and agent execution are disabled on Vercel.");
  const owner = process.env.OWNER_TOKEN?.trim();
  if (!owner || owner.length < 32) {
    throw new Error("Configure OWNER_TOKEN with at least 32 characters.");
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (request.headers.has("origin") && !sameBrowserOrigin(request)) throw new Error("Request origin is not allowed.");
  return { owner, authorization };
}

export function requireRole(request: Request, role: "owner") {
  const { owner: expected, authorization } = requireConfiguredRequest(request);
  if (!authorization.startsWith("Bearer ") || !timingSafeEqual(digest(authorization.slice(7)), digest(expected!))) {
    throw new Error("Valid role bearer token required.");
  }
  return digest(expected!).toString("hex");
}

export function requireOwnerMutation(request: Request) {
  requireRole(request, "owner");
  if (request.headers.get("x-unflat-confirmation") !== "CONFIRM") throw new Error("Owner must type CONFIRM before execution.");
}
