import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";
import { RefusalError } from "@/core/errors";

const schema = z.object({
  agentId: z.string().uuid(),
  amountUsdcCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
  strategyId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await runtime.gateway.sweepIdle(parsed.data));
  } catch (error) {
    const status = error instanceof RefusalError ? 403 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sweep failed." }, { status });
  }
}
