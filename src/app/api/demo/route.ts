import { NextResponse } from "next/server";
import { runDemo } from "@/demo/run";

export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json(await runDemo());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Demo failed." },
      { status: 500 },
    );
  }
}

