import { NextResponse } from "next/server";
import { RefusalError } from "@/core/errors";

export function invalidRequest(detail: unknown) {
  return NextResponse.json({ error: "Invalid request.", detail }, { status: 400 });
}

export function apiFailure(error: unknown, fallback: string, status = 500) {
  if (error instanceof RefusalError) {
    return NextResponse.json({ error: error.message, detail: error.decision }, { status: 403 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid JSON body.", detail: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: fallback, detail: error instanceof Error ? error.message : String(error) },
    { status },
  );
}
