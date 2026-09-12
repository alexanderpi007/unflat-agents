class SwarmCallError extends Error {}

function redact(message: string): string {
  return message
    .replace(/(?:0x)?[a-fA-F0-9]{64,}/g, "[redacted hex secret/reference]")
    .replace(/([?&](?:[^=\s&]+)=)[^\s&#]*/g, "$1[redacted]")
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, "$1 [redacted]");
}

export function swarmErrorDetail(call: string, error: unknown): string {
  if (error instanceof SwarmCallError) return error.message;
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const response = record.response && typeof record.response === "object"
    ? record.response as Record<string, unknown> : {};
  const message = typeof record.message === "string" ? record.message
    : typeof error === "string" ? error : "Unknown error (SDK supplied no message)";
  const candidate = record.status ?? record.statusCode ?? response.status
    ?? message.match(/(?:HTTP|status(?: code)?|statusCode)[\s:=]+([1-5]\d{2})/i)?.[1];
  const status = /^\d{3}$/.test(String(candidate)) ? String(candidate) : "not supplied by SDK";
  return `${call} — status: ${status} — ${redact(message)}`;
}

export async function swarmCall<T>(call: string, work: () => Promise<T>): Promise<T> {
  console.info(`[Swarm ID] ${call} started`);
  try { return await work(); }
  catch (error) {
    // Never log the original object: SDK errors may contain references, keys or request bodies.
    const detail = swarmErrorDetail(call, error);
    console.error(`[Swarm ID] ${detail}`);
    throw new SwarmCallError(detail);
  }
}
