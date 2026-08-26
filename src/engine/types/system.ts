import type { AssemblyOptics, Fraction, Millimeters, RGB } from "./optics";

/**
 * Glazing surface numbering: #1 is the outermost (exterior) surface, counting
 * inward. A double IGU has #1–#4, a triple #1–#6. Low-e commonly sits on #2.
 */
export type SurfaceNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type SubstrateTint = "clear" | "low-iron" | "green" | "gray" | "bronze" | "blue";

export type CoatingKind = "low-e" | "reflective" | "other";

/**
 * Forced coating properties.
 *
 * The solver normally derives all three from the measured assembly values.
 * Pinning one holds it exactly and leaves fewer free parameters for the same
 * three measurements, so the fit residual grows — which is the honest signal
 * that an override disagrees with the cutsheet.
 */
export interface CoatingOverrides {
  /** Light passing through the coating, per channel. */
  transmission?: RGB;
  /** Reflectance seen from the exterior side. */
  reflectanceExt?: RGB;
  /** Reflectance seen from the interior side. */
  reflectanceInt?: RGB;
}

export interface CoatingInput {
  kind: CoatingKind;
  surface: SurfaceNumber;
  /**
   * Fallback hue for reflection, used only when the assembly carries no
   * measured exterior/interior reflected colour.
   */
  reflectedColor?: RGB;
  overrides?: CoatingOverrides;
}

export interface LiteInput {
  thickness: Millimeters;
  substrate: SubstrateTint;
  coating?: CoatingInput;
}

/** Gas fill does not measurably affect visible optics; add later if needed. */
export interface GapInput {
  width: Millimeters;
}

export type FritPattern =
  | { kind: "dots"; dotDiameter: Millimeters; spacing: Millimeters }
  | {
      kind: "lines";
      lineWidth: Millimeters;
      spacing: Millimeters;
      orientation: "horizontal" | "vertical";
    }
  /** Uploaded black/white coverage map; white = frit. Bytes, never a File. */
  | { kind: "texture"; fileName: string; bytes: Uint8Array }
  /** No visible pattern — statistically correct coverage only. */
  | { kind: "uniform"; coverage: Fraction };

export interface FritInput {
  pattern: FritPattern;
  color: RGB;
  surface: SurfaceNumber;
  /** How much light the frit blocks where it sits (1 = fully opaque enamel). */
  opacity: Fraction;
}

export interface GlazingSystemInput {
  /** User label; sanitized into MDL identifiers and file names. */
  name: string;
  /** 1 = monolithic, 2 = double IGU, 3 = triple IGU. */
  lites: LiteInput[];
  /** Length must be lites.length - 1. */
  gaps: GapInput[];
  assembly: AssemblyOptics;
  frit?: FritInput;
}

/**
 * How the user modeled the glazing in 3ds Max. Deliberately not part of
 * GlazingSystemInput: the same system can be exported either way.
 *
 * - planar:     one zero-thickness surface for the whole assembly
 * - volumetric: each lite is a closed solid
 */
export type ExportMode = "planar" | "volumetric";
