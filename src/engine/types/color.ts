/**
 * How a measured colour was supplied.
 *
 * Cutsheets are inconsistent about this. Technical documents from Guardian,
 * Viracon, and Vitro publish CIELAB under D65 (the convention ASTM C1376 and
 * D2244 are written around); some European sheets give CIE chromaticity
 * instead; and plenty of product sheets — including Vitro's own Solarban 60
 * sheet — print nothing but a colour swatch and a CRI number.
 */
export type ColorSpec =
  /** No measured colour: hue comes from the nominal substrate tint table. */
  | { kind: "auto" }
  /** CIELAB under D65. Architectural glass runs L* 20–97, chroma within ±20. */
  | { kind: "lab"; L: number; a: number; b: number }
  /** CIE 1931 chromaticity coordinates. */
  | { kind: "xy"; x: number; y: number }
  /** Eyedropped or eyeballed from a printed swatch. */
  | { kind: "srgb"; hex: string };

/**
 * Standard observer the colour data was measured against.
 *
 * Recorded for provenance rather than used in the maths: conversion runs
 * through the CIE 1931 (2°) matrices that sRGB is defined by, and the 2°/10°
 * difference is far smaller than the other approximations in the pipeline.
 * See docs/physics.md.
 */
export type StandardObserver = "2" | "10";

export const AUTO_COLOR: ColorSpec = { kind: "auto" };

export function isMeasured(spec: ColorSpec | undefined): boolean {
  return spec !== undefined && spec.kind !== "auto";
}
