import { ArkivMandateReader } from "../src/adapters/live/arkiv";

const agentId = process.argv[2]?.trim();
if (!agentId) {
  console.error("Usage: npm run verify:mandate <agent>");
  process.exitCode = 1;
} else {
  const result = await new ArkivMandateReader().findValidMandates(agentId);
  console.log(JSON.stringify(result, null, 2));
}
