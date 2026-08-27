import { fraction, mm } from "@/engine/types/optics";
import type { ExportMode, GlazingSystemInput } from "@/engine/types/system";

/**
 * Fixtures span the export matrix: lite counts, coated and uncoated, tinted
 * substrates, every frit pattern kind, and both export modes. Values come from
 * published manufacturer performance data where a real product is named.
 */

/** A tiny valid PNG, standing in for an uploaded frit mask. */
export const MASK_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x7e, 0x9b,
  0x55, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

export const monolithicClear: GlazingSystemInput = {
  name: "Clear 6mm",
  lites: [{ thickness: mm(6), substrate: "clear" }],
  gaps: [],
  assembly: { tvis: fraction(0.88), rvisExt: fraction(0.08), rvisInt: fraction(0.08) },
};

export const monolithicBronze: GlazingSystemInput = {
  name: "Bronze 6mm",
  lites: [{ thickness: mm(6), substrate: "bronze" }],
  gaps: [],
  assembly: { tvis: fraction(0.52), rvisExt: fraction(0.06), rvisInt: fraction(0.06) },
};

/** Vitro Solarban 60 on clear, 1" IGU. */
export const solarban60: GlazingSystemInput = {
  name: "Solarban 60 clear",
  lites: [
    {
      thickness: mm(6),
      substrate: "clear",
      coating: { kind: "low-e", surface: 2, reflectedColor: { r: 0.8, g: 0.85, b: 0.9 } },
    },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: { tvis: fraction(0.7), rvisExt: fraction(0.11), rvisInt: fraction(0.12) },
};

/** A reflective coated product: much more mirror-like than a low-e. */
export const reflectiveGray: GlazingSystemInput = {
  name: "Reflective gray IGU",
  lites: [
    {
      thickness: mm(6),
      substrate: "gray",
      coating: { kind: "reflective", surface: 2, reflectedColor: { r: 0.7, g: 0.72, b: 0.75 } },
    },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: { tvis: fraction(0.2), rvisExt: fraction(0.32), rvisInt: fraction(0.25) },
};

export const tripleLowIron: GlazingSystemInput = {
  name: "Triple low-iron",
  lites: [
    { thickness: mm(6), substrate: "low-iron", coating: { kind: "low-e", surface: 2 } },
    { thickness: mm(4), substrate: "low-iron" },
    { thickness: mm(6), substrate: "low-iron" },
  ],
  gaps: [{ width: mm(12) }, { width: mm(12) }],
  assembly: { tvis: fraction(0.62), rvisExt: fraction(0.16), rvisInt: fraction(0.17) },
};

export const dotFrit: GlazingSystemInput = {
  ...solarban60,
  name: "Dot frit IGU",
  frit: {
    pattern: { kind: "dots", dotDiameter: mm(6), spacing: mm(12) },
    color: { r: 0.9, g: 0.9, b: 0.88 },
    surface: 2,
    opacity: fraction(0.92),
  },
};

export const lineFrit: GlazingSystemInput = {
  ...solarban60,
  name: "Line frit IGU",
  frit: {
    pattern: { kind: "lines", lineWidth: mm(3), spacing: mm(10), orientation: "horizontal" },
    color: { r: 0.85, g: 0.85, b: 0.85 },
    surface: 2,
    opacity: fraction(1),
  },
};

export const maskFrit: GlazingSystemInput = {
  ...solarban60,
  name: "Custom mask frit",
  frit: {
    pattern: { kind: "texture", fileName: "custom_pattern.png", bytes: MASK_BYTES },
    color: { r: 0.95, g: 0.95, b: 0.93 },
    surface: 2,
    opacity: fraction(0.9),
  },
};

export const uniformFrit: GlazingSystemInput = {
  ...monolithicClear,
  name: "Uniform frit monolithic",
  frit: {
    pattern: { kind: "uniform", coverage: fraction(0.4) },
    color: { r: 0.9, g: 0.9, b: 0.9 },
    surface: 2,
    opacity: fraction(0.95),
  },
};

/** Measured colour supplied as CIELAB, the way technical documents publish it. */
export const labSpecified: GlazingSystemInput = {
  name: "Lab specified IGU",
  lites: [
    { thickness: mm(6), substrate: "clear", coating: { kind: "low-e", surface: 2 } },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: {
    tvis: fraction(0.7),
    rvisExt: fraction(0.11),
    rvisInt: fraction(0.12),
    transmittedColor: { kind: "lab", L: 87, a: -3.4, b: 1.2 },
    reflectedColorExt: { kind: "lab", L: 39.6, a: -1.8, b: -7.5 },
    reflectedColorInt: { kind: "lab", L: 41.2, a: 0.6, b: 2.1 },
    observer: "10",
  },
};

/** A coating property pinned by hand, overriding what the solver would derive. */
export const pinnedCoating: GlazingSystemInput = {
  name: "Pinned coating IGU",
  lites: [
    {
      thickness: mm(6),
      substrate: "clear",
      coating: {
        kind: "reflective",
        surface: 2,
        overrides: { reflectanceExt: { r: 0.26, g: 0.27, b: 0.3 } },
      },
    },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: { tvis: fraction(0.35), rvisExt: fraction(0.28), rvisInt: fraction(0.24) },
};

/** Colour eyedropped from a printed swatch, for sheets that publish no numbers. */
export const swatchSpecified: GlazingSystemInput = {
  name: "Swatch specified",
  lites: [{ thickness: mm(6), substrate: "green" }],
  gaps: [],
  assembly: {
    tvis: fraction(0.75),
    rvisExt: fraction(0.07),
    rvisInt: fraction(0.07),
    transmittedColor: { kind: "srgb", hex: "#B8CBB4" },
  },
};

export interface Fixture {
  slug: string;
  input: GlazingSystemInput;
  mode: ExportMode;
}

/** Roller wave on a coated IGU: normal map on every lite material. */
export const rollerWaveIgu: GlazingSystemInput = {
  name: "Roller wave IGU",
  lites: [
    {
      thickness: mm(6),
      substrate: "clear",
      coating: { kind: "low-e", surface: 2, reflectedColor: { r: 0.8, g: 0.85, b: 0.9 } },
    },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: { tvis: fraction(0.7), rvisExt: fraction(0.11), rvisInt: fraction(0.12) },
  rollerWave: { depth: "typical" },
};

export const FIXTURES: Fixture[] = [
  { slug: "monolithic-clear-planar", input: monolithicClear, mode: "planar" },
  { slug: "monolithic-clear-volumetric", input: monolithicClear, mode: "volumetric" },
  { slug: "monolithic-bronze-volumetric", input: monolithicBronze, mode: "volumetric" },
  { slug: "solarban60-planar", input: solarban60, mode: "planar" },
  { slug: "solarban60-volumetric", input: solarban60, mode: "volumetric" },
  { slug: "reflective-gray-planar", input: reflectiveGray, mode: "planar" },
  { slug: "reflective-gray-volumetric", input: reflectiveGray, mode: "volumetric" },
  { slug: "triple-low-iron-volumetric", input: tripleLowIron, mode: "volumetric" },
  { slug: "dot-frit-planar", input: dotFrit, mode: "planar" },
  { slug: "dot-frit-volumetric", input: dotFrit, mode: "volumetric" },
  { slug: "line-frit-volumetric", input: lineFrit, mode: "volumetric" },
  { slug: "mask-frit-volumetric", input: maskFrit, mode: "volumetric" },
  { slug: "uniform-frit-planar", input: uniformFrit, mode: "planar" },
  { slug: "lab-specified-planar", input: labSpecified, mode: "planar" },
  { slug: "pinned-coating-planar", input: pinnedCoating, mode: "planar" },
  { slug: "roller-wave-planar", input: rollerWaveIgu, mode: "planar" },
  { slug: "roller-wave-volumetric", input: rollerWaveIgu, mode: "volumetric" },
  { slug: "swatch-specified-volumetric", input: swatchSpecified, mode: "volumetric" },
];
