import type { ColorSpec } from "./color";
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

/**
 * Heat-treatment ripple shipped as a normal map with the export. Ridges run
 * horizontally, the common installed orientation; per-lite variety comes
 * from the apply script's UV offsets, not from direction, because a real
 * facade's lites share the fabricator's furnace direction.
 */
export interface RollerWaveInput {
  /** Peak-to-valley depth preset over a 300mm wave. */
  depth: "subtle" | "typical" | "strong";
}

export type SpandrelFinish = "matte" | "metallic";

/**
 * What makes a glazing build-up a spandrel: an opaque finish the manufacturer
 * offers, behind glass chosen from an ordinary glazing data sheet. There is no
 * spandrel data sheet, so the finish colour is taken as given — the one place
 * a colour sets level as well as hue — and the tool reports what the panel
 * reads as from outside once that colour sits behind the fitted glass.
 */
export type SpandrelInput =
  /** Opaque paint fused to the back of a lite: typically #4 on a double unit. */
  | {
      kind: "flood-coat";
      /** Must be a back face (an even-numbered surface). */
      surface: SurfaceNumber;
      color: ColorSpec;
      /** Where the colour came from: "RAL 7024", a Kynar name, "sample photo". */
      colorLabel?: string;
    }
  /** Shadow box: the glass stays glass; a metal pan sits behind an air cavity. */
  | {
      kind: "back-pan";
      /** Air gap between the innermost lite and the pan face. */
      cavity: Millimeters;
      color: ColorSpec;
      colorLabel?: string;
      finish: SpandrelFinish;
    };

export interface GlazingSystemInput {
  /** User label; sanitized into MDL identifiers and file names. */
  name: string;
  /** 1 = monolithic, 2 = double IGU, 3 = triple IGU. */
  lites: LiteInput[];
  /** Length must be lites.length - 1. */
  gaps: GapInput[];
  assembly: AssemblyOptics;
  frit?: FritInput;
  /** Present = roller wave enabled for every lite. */
  rollerWave?: RollerWaveInput;
  /** Present = this build-up is a spandrel; excludes frit. */
  spandrel?: SpandrelInput;
}

/**
 * How the user modeled the glazing in 3ds Max. Deliberately not part of
 * GlazingSystemInput: the same system can be exported either way.
 *
 * - planar:     one zero-thickness surface for the whole assembly
 * - volumetric: each lite is a closed solid
 */
export type ExportMode = "planar" | "volumetric";
