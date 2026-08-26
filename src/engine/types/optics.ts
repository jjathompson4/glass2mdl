import type { ColorSpec, StandardObserver } from "./color";

/**
 * Core optical/unit primitives. Branded numeric types keep unit mistakes
 * (percent vs fraction, mm vs inch) from silently propagating through the solver.
 */

export type Millimeters = number & { readonly __brand: "mm" };

/** A 0–1 value. Cutsheets quote percentages; the UI converts at the boundary. */
export type Fraction = number & { readonly __brand: "fraction" };

export const mm = (v: number): Millimeters => v as Millimeters;
export const fraction = (v: number): Fraction => v as Fraction;

/** Linear (not sRGB-encoded) RGB, nominally 0–1 per channel. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Optical triple for one element (a lite, a coated lite, or a whole assembly),
 * measured over the visible band. Front = exterior-facing side.
 */
export interface Optics {
  /** Transmittance (identical in both directions for these systems). */
  t: RGB;
  /** Reflectance, exterior-facing side. */
  rFront: RGB;
  /** Reflectance, interior-facing side. */
  rBack: RGB;
}

/**
 * What the user reads off a cutsheet for the whole assembly.
 *
 * The three performance values set level; the optional colour entries set hue.
 * Where a colour is absent the substrate tint table supplies the hue instead,
 * which is a nominal guess rather than a measurement.
 */
export interface AssemblyOptics {
  tvis: Fraction;
  rvisExt: Fraction;
  rvisInt: Fraction;
  transmittedColor?: ColorSpec;
  reflectedColorExt?: ColorSpec;
  reflectedColorInt?: ColorSpec;
  /** Provenance for the colour data; see docs/physics.md. */
  observer?: StandardObserver;
}

/** Per-lite solver output, surfaced in the UI breakdown and the export README. */
export interface LiteDerived {
  index: number;
  thickness: Millimeters;
  /** Single-pass internal transmittance through the glass body, per channel. */
  internalTransmittance: RGB;
  /** Beer-Lambert absorption coefficient in 1/meter, per channel. */
  absorptionCoefficient: RGB;
  /** Normal-incidence reflectivity of this lite's coating, if any. */
  coatingR0?: number;
  coatingColor?: RGB;
}

/**
 * Everything the solver worked out. Feeds both the preview shader and the
 * MDL emitter, so the two can never disagree about what was computed.
 */
export interface DerivedOptics {
  lites: LiteDerived[];
  /** What the solver worked out for the coating, shown as swatches in the UI. */
  coating?: {
    surface: number;
    transmission: RGB;
    reflectanceExt: RGB;
    reflectanceInt: RGB;
  };
  /** Assembly optics recomputed from the per-lite fit (forward pass). */
  recomputed: Optics;
  /** Recomputed minus measured, per quantity — how well the fit closed. */
  residual: {
    tvis: number;
    rvisExt: number;
    rvisInt: number;
    /** Largest absolute residual across the three, for quick UI thresholding. */
    max: number;
  };
}
