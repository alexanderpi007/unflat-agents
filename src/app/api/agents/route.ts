import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";

const inputSchema = z.object({ displayName: z.string().min(1).max(64) });

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await runtime.gateway.createAgent(parsed.data.displayName), { status: 201 });
}

