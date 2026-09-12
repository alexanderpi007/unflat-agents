import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";
import { apiFailure, invalidRequest } from "@/app/api/responses";
import { runtime } from "@/server/runtime";
import type { HexAddress } from "@/core/types";

const inputSchema = z.object({
  agentId: z.string().uuid(),
  recipient: z.string().refine(isAddress, "recipient must be a valid EVM address"),
  amountUsdcCents: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    try { requireLocalMutation(request); } catch (error) { return apiFailure(error, "Local execution only.", 403); }
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return invalidRequest(parsed.error.flatten());
    const input = parsed.data;
    return NextResponse.json(await runtime.gateway.transferUsdc({
      ...input,
      recipient: input.recipient as HexAddress,
    }));
  } catch (error) {
    return apiFailure(error, "USDC transfer failed.");
  }
}
import { requireLocalMutation } from "@/server/local-only";
