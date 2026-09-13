import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { createPublicClient, http, erc20Abi, erc4626Abi, decodeEventLog, decodeFunctionData, parseAbi, encodeAbiParameters, keccak256 } from "viem";
import { base, sepolia } from "viem/chains";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { createPublicClient as createArkivClient } from "@arkiv-network/sdk";
import { str, u64 } from "@arkiv-network/sdk/attr";
import { eq, gt } from "@arkiv-network/sdk/query";
import { PrivyClient } from "@privy-io/node";
import { ArkivMandateReader } from "../src/adapters/live/arkiv";
import { resolverAbi } from "../src/adapters/live/ens-contracts";
import type { RealRun } from "../src/demo/export-real-run";

// Read-only audit. Never print credentials, owner emails, tokens or commitment openings.
loadEnvFile();
const store = JSON.parse(await readFile(process.env.GATEWAY_STORE_PATH || ".data/gateway.json", "utf8"));
const clients = {
  base: createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL, { retryCount: 3, retryDelay: 1500 }) }),
  ens: createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL, { retryCount: 3, retryDelay: 1500 }) }),
  arkiv: createPublicClient({ chain: tiramisu, transport: http() }),
};
const privy = new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
const safe = async (label: string, work: () => Promise<unknown>) => {
  try { console.log(json({ check: label, evidence: await work() })); }
  catch (error) { console.log(json({ check: label, unavailable: true, error: (error as Error).name })); process.exitCode = 1; }
};
for (const file of ["nova-2026-09-13.json", "atlas-2026-09-12.json"]) {
  const run = JSON.parse(await readFile(`public/real-runs/${file}`, "utf8")) as RealRun;
  const { agent, mandate, events } = run.snapshot;
  const stored = store.agents[agent.id];
  const opening = store.mandateOpenings[mandate.id];
  console.log(json({ run: file, store: {
    walletMatches: stored?.walletAddress === agent.walletAddress, nameMatches: stored?.ensName === agent.ensName,
    mandatePublicFieldsMatch: Object.entries(mandate).filter(([key]) => key !== "ownerId").every(([key, value]) => JSON.stringify(store.mandates[agent.id]?.[key]) === JSON.stringify(value)),
    amountsMatch: ["maxTotalUsdcCents", "maxPerActionUsdcCents", "spentUsdcCents"].every(k => store.mandates[agent.id]?.[k] === (mandate as any)[k]),
    commitmentMatches: !!opening && keccak256(encodeAbiParameters([{type:"string"},{type:"uint256"},{type:"uint256"},{type:"bytes32"}],
      [agent.id, BigInt(mandate.maxTotalUsdcCents), BigInt(mandate.maxPerActionUsdcCents), opening.secret])) === mandate.arkivCommitment,
    ownership: stored?.ownership?.kind ?? "app-owned", ensModeStored: stored?.ensMode ?? null,
    events: events.map(e => { const original = store.events.find((s: any) => s.id === e.id); return { id: e.id, action: e.action,
      matches: !!original && ["agentId", "action", "status", "amountUsdcCents", "at"].every(k => original[k] === (e as any)[k]),
      referenceMatches: original?.reference === e.reference,
      recordedAsMock: /MOCK|simulated/i.test(original?.reason ?? ""),
      recordedQueryBlock: original?.reason.match(/is live at block (\d+)/)?.[1] ?? (e.status === "refused" ? original?.reason.match(/at block (\d+)/)?.[1] : undefined),
      recordedRawShares: original?.reason.match(/vault shares \((\d+) raw\)/)?.[1],
      recordedFreeAdvice: e.action === "aimorgan.strategize" ? /free REST call/.test(original?.reason ?? "") : undefined }; }),
  } }));
  for (const event of events.filter(e => e.status === "completed" && ["usdc.transfer", "earn.approve", "earn.sweep"].includes(e.action))) {
    await safe(`${file} ${event.action}`, async () => {
      const hash = event.reference as `0x${string}`;
      const receipt = await clients.base.getTransactionReceipt({ hash });
      const transaction = await clients.base.getTransaction({ hash });
      const block = await clients.base.getBlock({ blockNumber: receipt.blockNumber });
      const decoded = receipt.logs.flatMap(log => { try { return [{ address: log.address, ...decodeEventLog({ abi: [...erc20Abi, ...erc4626Abi], data: log.data, topics: log.topics }) }]; } catch { return []; } });
      return { hash, status: receipt.status, block: receipt.blockNumber, at: new Date(Number(block.timestamp)*1000).toISOString(),
        from: receipt.from, to: receipt.to, senderMatches: receipt.from.toLowerCase() === agent.walletAddress.toLowerCase(),
        input: decodeFunctionData({ abi: [...erc20Abi, ...erc4626Abi], data: transaction.input }), logs: decoded };
    });
  }
  await safe(`${file} ENS`, async () => {
    const address = await clients.ens.getEnsAddress({ name: agent.ensName });
    const event = events.find(e => e.action === "ens.records")!;
    const hash = event.reference!.split("/").at(-1) as `0x${string}`;
    const tx = await clients.ens.getTransaction({ hash });
    const receipt = await clients.ens.getTransactionReceipt({ hash });
    const input = decodeFunctionData({ abi: resolverAbi, data: tx.input });
    return { name: agent.ensName, address, matches: address?.toLowerCase() === agent.walletAddress.toLowerCase(), block: receipt.blockNumber,
      hash, status: receipt.status, to: receipt.to, records: input.functionName === "multicall" ? input.args[0].map(data => decodeFunctionData({ abi: resolverAbi, data })) : input,
      currentCommitment: await clients.ens.getEnsText({ name: agent.ensName, key: "mandate.commitment" }), gateway: await clients.ens.getEnsText({ name: agent.ensName, key: "gateway" }) };
  });
  await safe(`${file} Arkiv`, async () => {
    const receipt = await clients.arkiv.getTransactionReceipt({ hash: mandate.arkivTransactionHash! });
    const block = await clients.arkiv.getBlock({ blockNumber: receipt.blockNumber });
    const created = parseAbi(["event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)"]);
    const logs = receipt.logs.map(log => ({ address: log.address, ...decodeEventLog({ abi: created, data: log.data, topics: log.topics }) }));
    const history = await clients.arkiv.request({ method: "eth_getLogs", params: [{ fromBlock: `0x${receipt.blockNumber.toString(16)}`, toBlock: "latest", topics: [null, mandate.arkivEntityKey!] }] });
    const paid = store.events.find((e: any) => e.id === events.find(e => e.action === "usdc.transfer" && e.status === "completed")?.id);
    const beforeBlock = BigInt(paid.reason.match(/is live at block (\d+)/)[1]);
    const afterBlock = BigInt(events.find(e => e.status === "refused")!.reason.match(/at block (\d+)/)![1]);
    const builder = createArkivClient({ chain: tiramisu, transport: http() }).select({ key: true, attributes: true, expiresAt: true, payload: true })
      .where(eq("agent_id", str(agent.id)), gt("$expiresAt", u64(beforeBlock))).createdBy("0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf");
    const before = await builder.atBlock(beforeBlock).fetch();
    const after = await builder.atBlock(afterBlock).fetch();
    return { hash: receipt.transactionHash, status: receipt.status, block: receipt.blockNumber, at: new Date(Number(block.timestamp)*1000).toISOString(),
      logs, lifetimeBlocks: BigInt(mandate.arkivExpiresAtBlock!) - receipt.blockNumber, entityLogsThroughHead: history,
      historicalQuery: { query: builder.toString(), before: { block: before.blockNumber, entities: before.entities }, after: { block: after.blockNumber, entities: after.entities } },
      currentQuery: await new ArkivMandateReader().findValidMandates(agent.id) };
  });
  await safe(`${file} Privy ownership`, async () => {
    const wallet = await privy.wallets().get(stored.walletId);
    const owner = wallet.owner_id ? await privy.keyQuorums().get(wallet.owner_id) : undefined;
    const policy = stored.ownership?.policyId ? await privy.policies().get(stored.ownership.policyId) : undefined;
    const user = stored.ownership?.privyUserId ? await privy.users()._get(stored.ownership.privyUserId) : undefined;
    const policyOwner = policy?.owner_id ? await privy.keyQuorums().get(policy.owner_id) : undefined;
    return { address: wallet.address, chain: wallet.chain_type, walletMatches: wallet.address.toLowerCase() === agent.walletAddress.toLowerCase(),
      ownerIsStoredUser: !!owner && owner.user_ids?.length === 1 && owner.user_ids[0] === stored.ownership?.privyUserId,
      ownerThreshold: owner?.authorization_threshold, ownerAuthorizationKeyCount: owner?.authorization_keys.length,
      ownerEmailMatchesStore: user?.linked_accounts.some(a => a.type === "email" && a.address.toLowerCase() === stored.ownership?.ownerEmail.toLowerCase()),
      policyOwnerIsStoredUser: policyOwner?.user_ids?.length === 1 && policyOwner.user_ids[0] === stored.ownership?.privyUserId,
      topLevelPolicies: wallet.policy_ids.length, additionalSignerCount: wallet.additional_signers.length,
      delegatedPolicyMatches: wallet.additional_signers.some(s => s.signer_id === stored.ownership?.signerId && s.override_policy_ids?.includes(stored.ownership?.policyId)),
      policyRules: policy?.rules.map(rule => ({ name: rule.name, method: rule.method, action: rule.action,
        conditions: rule.conditions.map(({ field_source, field, operator, value }) => ({ field_source, field, operator, value })) })) };
  });
}
await safe("Vault", async () => {
  const address = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
  return { address, asset: await clients.base.readContract({ address, abi: erc4626Abi, functionName: "asset" }),
    name: await clients.base.readContract({ address, abi: erc20Abi, functionName: "name" }),
    decimals: await clients.base.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    assetDecimals: await clients.base.readContract({ address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", abi: erc20Abi, functionName: "decimals" }),
    apy: await (await fetch(`https://api.morpho.org/v1/vaults-v2/8453:${address}/apy-averages?lookback=six_hours`)).json() };
});
