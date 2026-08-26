import type { ExportMode } from "../types/system";

/**
 * Contract for the true-preview render service.
 *
 * Defined now, implemented later. The service renders with a real MDL
 * renderer on a GPU, which the app itself cannot do — the in-browser preview
 * is an approximation and says so.
 *
 * Two decisions are worth keeping when this gets built:
 *
 * The request carries the *generated MDL text*, not the glazing parameters.
 * The service stays dumb, and the preview provably renders the same bytes the
 * user downloads rather than a second interpretation of the same inputs.
 *
 * A compile failure returns its compiler log. The renderer is also the only
 * real MDL compiler in the pipeline, so that log is how generated output gets
 * validated automatically instead of by loading files into 3ds Max by hand.
 */
export const RENDER_API_VERSION = "1" as const;

/**
 * Curated scenes rather than arbitrary ones. Provisional: this list is settled
 * when the in-browser preview's viewing conditions are designed, so both
 * previews describe scenes with the same vocabulary.
 */
export type RenderScene = "facade-day" | "interior-day" | "frit-closeup";

export interface RenderRequest {
  version: typeof RENDER_API_VERSION;
  scene: RenderScene;
  view: "exterior" | "interior";
  glazing: {
    mode: ExportMode;
    mdlModule: { fileName: string; source: string };
    materialAssignments: { slot: string; materialName: string }[];
    textures?: { fileName: string; base64: string }[];
  };
  output: {
    width: number;
    height: number;
    format: "png" | "jpeg";
    maxSamples?: number;
    timeBudgetMs?: number;
  };
}

/** POST /api/render/jobs → 202 */
export interface RenderJobAccepted {
  jobId: string;
  statusUrl: string;
}

/** GET /api/render/jobs/:id */
export type RenderJobStatus =
  | { state: "queued" | "rendering"; progress?: number }
  | { state: "done"; imageUrl: string; renderStats: { samples: number; wallMs: number } }
  | {
      state: "error";
      code: "MDL_COMPILE_FAILED" | "TIMEOUT" | "INTERNAL";
      message: string;
      compileLog?: string;
    };

export interface RenderError {
  code: "INVALID_REQUEST" | "PAYLOAD_TOO_LARGE" | "UNAVAILABLE" | "NOT_IMPLEMENTED";
  message: string;
}
