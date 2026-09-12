import type { StatementStoragePort } from "@/core/ports";

export class OwnerBrowserStatementStorage implements StatementStoragePort {
  async upload(): Promise<{ reference: string }> {
    throw new Error("Publish the statement from the OWNER RECORD card using Swarm ID. The gateway cannot upload to the owner's drive or receive its secret reference.");
  }
}
