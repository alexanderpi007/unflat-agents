import { createHash, timingSafeEqual } from "node:crypto";

export const ownerModeAvailable = () => !process.env.VERCEL;
const digest = (value: string) => createHash("sha256").update(value).digest();

export function sameBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && parsed.host === (request.headers.get("host") ?? new URL(request.url).host)
      && (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)));
  } catch { return false; }
}

export function requireRole(request: Request, role: "owner" | "agent") {
  if (process.env.VERCEL) throw new Error("Owner and agent execution are disabled on Vercel.");
  const owner = process.env.OWNER_TOKEN?.trim();
  const agent = process.env.MCP_AGENT_TOKEN?.trim();
  const expected = role === "owner" ? owner : agent;
  if (!owner || !agent || owner.length < 32 || agent.length < 32 || owner === agent) {
    throw new Error("Configure distinct OWNER_TOKEN and MCP_AGENT_TOKEN values of at least 32 characters.");
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || !timingSafeEqual(digest(authorization.slice(7)), digest(expected!))) {
    throw new Error("Valid role bearer token required.");
  }
  if (request.headers.has("origin") && !sameBrowserOrigin(request)) throw new Error("Request origin is not allowed.");
  return digest(expected!).toString("hex");
}

export function requireOwnerMutation(request: Request) {
  requireRole(request, "owner");
  if (request.headers.get("x-unflat-confirmation") !== "CONFIRM") throw new Error("Owner must type CONFIRM before execution.");
}
