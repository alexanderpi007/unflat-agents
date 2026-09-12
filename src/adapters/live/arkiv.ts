import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { bytes32, str, u64 } from "@arkiv-network/sdk/attr";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq, gt } from "@arkiv-network/sdk/query";
import { getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ArkivPort } from "@/core/ports";
import type {
  ArkivMandateEntity,
  ArkivMandatePublication,
  ArkivMandateQuery,
  HexAddress,
} from "@/core/types";

export const arkivCreatorAddress: HexAddress = "0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf";
export const arkivExplorerUrl = "https://tiramisu.explorer.arkiv.network";

const entityUrl = (key: string) => `${arkivExplorerUrl}/entity/${key}`;
const transactionUrl = (hash: string) => `${arkivExplorerUrl}/tx/${hash}`;

export class ArkivMandateReader {
  private readonly client = createPublicClient({ chain: tiramisu, transport: http() });
  private readonly creator: HexAddress;

  constructor(creator: HexAddress = arkivCreatorAddress) {
    this.creator = getAddress(creator) as HexAddress;
  }

  async findValidMandates(agentId: string): Promise<ArkivMandateQuery> {
    const head = await this.client.getBlockNumber();
    const builder = this.client
      .select({ key: true, creator: true, expiresAt: true, attributes: true })
      .where(eq("agent_id", str(agentId)), gt("$expiresAt", u64(head)))
      .createdBy(this.creator)
      .limit(20);
    const query = builder.toString();
    const page = await builder.fetch();
    const entities = page.entities.flatMap((entity): ArkivMandateEntity[] => {
      const storedAgent = entity.attributes.agent_id;
      const storedExpiry = entity.attributes.expiry;
      const storedCommitment = entity.attributes.commitment;
      if (
        storedAgent?.type !== "str"
        || storedExpiry?.type !== "u64"
        || storedCommitment?.type !== "bytes32"
        || entity.expiresAt === undefined
      ) return [];
      return [{
        entityKey: entity.key,
        explorerUrl: entityUrl(entity.key),
        agentId: storedAgent.value,
        expiry: new Date(Number(storedExpiry.value)).toISOString(),
        commitment: storedCommitment.value,
        expiresAtBlock: entity.expiresAt.toString(),
      }];
    });
    return {
      agentId,
      found: entities.length > 0,
      blockNumber: page.blockNumber.toString(),
      query,
      entities,
    };
  }
}

export class ArkivMandateAdapter implements ArkivPort {
  private readonly wallet;
  private readonly reader;

  constructor(privateKey: Hex) {
    const account = privateKeyToAccount(privateKey);
    this.wallet = createWalletClient({
      chain: tiramisu,
      transport: http(),
      account,
    });
    this.reader = new ArkivMandateReader(account.address);
  }

  async publishMandate(input: ArkivMandatePublication): Promise<ArkivMandateEntity> {
    if (!Number.isInteger(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds % 2 !== 0) {
      throw new Error("Arkiv mandate TTL must be a positive whole number of two-second blocks.");
    }
    const expires = ExpirationTime.fromBlocks(input.durationSeconds / 2);
    const result = await this.wallet.createEntity({
      payload: new Uint8Array(),
      contentType: "application/octet-stream",
      attributes: {
        agent_id: str(input.agentId),
        expiry: u64(BigInt(new Date(input.expiry).getTime())),
        commitment: bytes32(input.commitment),
      },
      expires,
    });
    return {
      entityKey: result.entityKey,
      transactionHash: result.txHash,
      explorerUrl: entityUrl(result.entityKey),
      transactionExplorerUrl: transactionUrl(result.txHash),
      agentId: input.agentId,
      expiry: input.expiry,
      commitment: input.commitment,
      expiresAtBlock: result.expiresAt.toString(),
    };
  }

  findValidMandates(agentId: string): Promise<ArkivMandateQuery> {
    return this.reader.findValidMandates(agentId);
  }
}
