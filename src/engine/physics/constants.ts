import type { RGB } from "../types/optics";
import type { SubstrateTint } from "../types/system";

/**
 * Soda-lime float glass index of refraction, visible band. Standard value used
 * by LBNL WINDOW and virtually all glazing literature.
 */
export const GLASS_IOR = 1.52;

/**
 * Normal-incidence Fresnel reflectance of a single air/glass interface:
 * r = ((n1 - n2) / (n1 + n2))^2. Symmetric in both directions at normal
 * incidence, which is what lets a bare lite be modeled with one value.
 */
export const AIR_GLASS_R0 = ((GLASS_IOR - 1) / (GLASS_IOR + 1)) ** 2; // ≈ 0.04256

/** Thickness the substrate table is quoted at. */
export const REFERENCE_THICKNESS_M = 0.006;

/**
 * Nominal internal (body) transmittance of each substrate at 6 mm, per channel,
 * excluding surface reflections.
 *
 * These are representative values consistent with published monolithic
 * performance data (clear float ~88% Tvis, low-iron ~91%, green ~75%, gray
 * ~43%, bronze ~52%, blue ~55% at 6 mm), decomposed into RGB to carry each
 * substrate's characteristic hue — clear float's faint green edge, bronze's
 * warmth, and so on.
 *
 * Two distinct jobs are served here. The *hue* is taken from this table always.
 * The *level* comes from the user's measured VLT wherever the fit can honor it,
 * so an off-nominal product still reproduces its own cutsheet number. Spectral
 * IGDB import (P4) replaces this table with measured curves.
 */
export const SUBSTRATE_INTERNAL_T_6MM: Record<SubstrateTint, RGB> = {
  clear: { r: 0.945, g: 0.965, b: 0.94 },
  "low-iron": { r: 0.9895, g: 0.991, b: 0.99 },
  green: { r: 0.704, g: 0.86, b: 0.723 },
  gray: { r: 0.475, g: 0.47, b: 0.455 },
  bronze: { r: 0.68, g: 0.55, b: 0.4 },
  blue: { r: 0.507, g: 0.608, b: 0.79 },
};

export const SUBSTRATE_LABELS: Record<SubstrateTint, string> = {
  clear: "Clear float",
  "low-iron": "Low-iron (ultra-clear)",
  green: "Green tint",
  gray: "Gray tint",
  bronze: "Bronze tint",
  blue: "Blue tint",
};

/** Typical enamel frit is highly opaque; users can override. */
export const DEFAULT_FRIT_OPACITY = 0.92;

/**
 * Schlick exponent for coating reflectance falloff. 5 is the classic Fresnel
 * approximation exponent and matches MDL's custom_curve_layer default shape.
 */
export const SCHLICK_EXPONENT = 5;
