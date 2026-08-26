import { NextResponse } from "next/server";
import type { RenderError } from "@/engine";

/** Job status polling. Stubbed alongside the job-creation route. */
export async function GET(): Promise<NextResponse<RenderError>> {
  return NextResponse.json(
    { code: "NOT_IMPLEMENTED", message: "No render jobs exist: the render service is not deployed." },
    { status: 501 },
  );
}
