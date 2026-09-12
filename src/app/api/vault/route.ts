import { runtime } from "@/server/runtime";
import { apiFailure } from "@/app/api/responses";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await runtime.gateway.vaultRate());
  } catch (error) {
    return apiFailure(error, "Could not read the configured Morpho vault APY.", 502);
  }
}
