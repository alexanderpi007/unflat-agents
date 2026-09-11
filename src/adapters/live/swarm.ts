import type { StatementStoragePort } from "@/core/ports";

export class SwarmGatewayAdapter implements StatementStoragePort {
  constructor(
    private readonly uploadUrl: string,
    private readonly postageBatchId: string,
  ) {}

  async upload(ciphertext: Uint8Array) {
    const response = await fetch(this.uploadUrl, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "swarm-postage-batch-id": this.postageBatchId,
        "swarm-encrypt": "false",
      },
      body: ciphertext as BodyInit,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Swarm upload failed with HTTP ${response.status}.`);
    const body = (await response.json()) as { reference?: string };
    if (!body.reference) throw new Error("Swarm response did not include a reference.");
    return { reference: `swarm:${body.reference}` };
  }
}

