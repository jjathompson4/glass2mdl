import { NextResponse } from "next/server";
import type { RenderError } from "@/engine";

/**
 * True-preview render jobs.
 *
 * Stubbed until the GPU render service exists — rendering MDL needs a real MDL
 * renderer on an NVIDIA GPU, which this deployment does not have. The route is
 * here now so the contract in the engine has a caller and stays typed.
 */
export async function POST(): Promise<NextResponse<RenderError>> {
  return NextResponse.json(
    {
      code: "NOT_IMPLEMENTED",
      message:
        "True MDL rendering is not available yet. Use the in-browser approximation, and confirm the final look in Iray.",
    },
    { status: 501 },
  );
}
