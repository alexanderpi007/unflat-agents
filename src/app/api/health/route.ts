import { NextResponse } from "next/server";
import { apiFailure } from "@/app/api/responses";
import { runtime } from "@/server/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(runtime.health);
  } catch (error) {
    return apiFailure(error, "Runtime health unavailable.");
  }
}
