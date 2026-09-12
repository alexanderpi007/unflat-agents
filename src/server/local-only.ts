const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalRequest(request: Request): boolean {
  if (process.env.VERCEL) return false;
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    return loopback.has(url.hostname) && host === url.host
      && !request.headers.has("forwarded")
      // Next itself adds this header; accept only an exact match, never a different forwarded host.
      && (!request.headers.has("x-forwarded-host") || request.headers.get("x-forwarded-host") === host);
  } catch { return false; }
}

export function requireLocalMutation(request: Request): void {
  if (!isLocalRequest(request) || request.headers.get("origin") !== new URL(request.url).origin) {
    throw new Error("LIVE execution is localhost-only and requires a same-origin browser request. Never available on Vercel.");
  }
}
