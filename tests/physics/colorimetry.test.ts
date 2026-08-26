import { describe, expect, it } from "vitest";
import {
  D65_WHITE,
  impliedLuminance,
  labToXYZ,
  lightnessToLuminance,
  linearRGBToXYZ,
  luminanceToLightness,
  resolveColorSpec,
  xyYToXYZ,
  xyzToLab,
  xyzToLinearRGB,
} from "@/engine/physics/colorimetry";

const NEUTRAL = { r: 1, g: 1, b: 1 };

describe("CIELAB conversions", () => {
  it("puts the D65 white point at L*100, a*0, b*0", () => {
    const lab = xyzToLab(D65_WHITE);
    expect(lab.L).toBeCloseTo(100, 6);
    expect(lab.a).toBeCloseTo(0, 6);
    expect(lab.b).toBeCloseTo(0, 6);
  });

  it("round-trips Lab through XYZ", () => {
    for (const [L, a, b] of [
      [50, 0, 0],
      [87, -2.5, 1.8],
      [74, -8, 4],
      [25, 12, -15],
      [95, 0.4, -1.2],
    ]) {
      const back = xyzToLab(labToXYZ(L, a, b));
      expect(back.L).toBeCloseTo(L, 6);
      expect(back.a).toBeCloseTo(a, 6);
      expect(back.b).toBeCloseTo(b, 6);
    }
  });

  it("round-trips linear RGB through XYZ", () => {
    for (const color of [
      { r: 1, g: 1, b: 1 },
      { r: 0.7, g: 0.72, b: 0.75 },
      { r: 0.2, g: 0.45, b: 0.3 },
    ]) {
      const back = xyzToLinearRGB(linearRGBToXYZ(color));
      expect(back.r).toBeCloseTo(color.r, 6);
      expect(back.g).toBeCloseTo(color.g, 6);
      expect(back.b).toBeCloseTo(color.b, 6);
    }
  });

  it("renders a neutral Lab value as neutral RGB", () => {
    const rgb = xyzToLinearRGB(labToXYZ(87, 0, 0));
    expect(rgb.r).toBeCloseTo(rgb.g, 3);
    expect(rgb.g).toBeCloseTo(rgb.b, 3);
  });

  it("maps chromaticity through the same white point", () => {
    // D65's own chromaticity must come back as a neutral colour.
    const xyz = xyYToXYZ(0.3127, 0.329, 100);
    const lab = xyzToLab(xyz);
    expect(lab.a).toBeCloseTo(0, 0);
    expect(lab.b).toBeCloseTo(0, 0);
  });
});

describe("lightness and luminance", () => {
  it("matches the published relationship between L* and visible transmittance", () => {
    // 70% Tvis — Solarban 60 — corresponds to roughly L* 87.
    expect(luminanceToLightness(0.7)).toBeCloseTo(87, 0);
    expect(lightnessToLuminance(87)).toBeCloseTo(0.7, 2);
  });

  it("round-trips across the range architectural glass occupies", () => {
    for (const Y of [0.07, 0.2, 0.45, 0.7, 0.88, 0.95]) {
      expect(lightnessToLuminance(luminanceToLightness(Y))).toBeCloseTo(Y, 9);
    }
  });

  it("brackets the L* 20-97 range glass is quoted in", () => {
    expect(lightnessToLuminance(20)).toBeGreaterThan(0);
    expect(lightnessToLuminance(20)).toBeLessThan(0.05);
    expect(lightnessToLuminance(97)).toBeGreaterThan(0.9);
  });

  it("reports an implied level only for Lab, which is the only spec carrying one", () => {
    expect(impliedLuminance({ kind: "lab", L: 87, a: 0, b: 0 })).toBeCloseTo(0.7, 2);
    expect(impliedLuminance({ kind: "xy", x: 0.31, y: 0.33 })).toBeUndefined();
    expect(impliedLuminance({ kind: "srgb", hex: "#88aacc" })).toBeUndefined();
    expect(impliedLuminance({ kind: "auto" })).toBeUndefined();
    expect(impliedLuminance(undefined)).toBeUndefined();
  });
});

describe("resolveColorSpec", () => {
  it("falls back when no colour was measured", () => {
    const fallback = { r: 0.7, g: 0.86, b: 0.72 };
    expect(resolveColorSpec(undefined, fallback)).toEqual(fallback);
    expect(resolveColorSpec({ kind: "auto" }, fallback)).toEqual(fallback);
  });

  it("normalizes away the level, keeping the direction of the tint", () => {
    // Level comes from the performance value, so every resolved hue peaks at 1
    // regardless of L*. The two are not identical colours: a* and b* are
    // absolute chroma offsets, so the same pair reads as more saturated against
    // a darker L* — correct CIELAB behaviour, not a normalization bug.
    const dim = resolveColorSpec({ kind: "lab", L: 40, a: -6, b: 3 }, NEUTRAL);
    const bright = resolveColorSpec({ kind: "lab", L: 80, a: -6, b: 3 }, NEUTRAL);

    expect(Math.max(dim.r, dim.g, dim.b)).toBeCloseTo(1, 6);
    expect(Math.max(bright.r, bright.g, bright.b)).toBeCloseTo(1, 6);

    for (const hue of [dim, bright]) {
      expect(hue.g).toBeGreaterThan(hue.r); // both lean green, as a* < 0 demands
      expect(hue.g).toBeGreaterThan(hue.b);
    }
    expect(dim.r / dim.g).toBeLessThan(bright.r / bright.g); // darker reads more saturated
  });

  it("reads a green-tinted glass colour as green", () => {
    // Negative a* is the green axis; typical of a green float substrate.
    const green = resolveColorSpec({ kind: "lab", L: 74, a: -9.5, b: 2.5 }, NEUTRAL);
    expect(green.g).toBeGreaterThan(green.r);
    expect(green.g).toBeGreaterThan(green.b);
  });

  it("reads a bronze glass colour as warm", () => {
    const bronze = resolveColorSpec({ kind: "lab", L: 52, a: 6, b: 18 }, NEUTRAL);
    expect(bronze.r).toBeGreaterThan(bronze.b);
  });

  it("reads a blue-tinted coating as cool", () => {
    const blue = resolveColorSpec({ kind: "lab", L: 60, a: -2, b: -12 }, NEUTRAL);
    expect(blue.b).toBeGreaterThan(blue.r);
  });

  it("clamps out-of-gamut colours instead of emitting negative light", () => {
    // A saturated value that lands outside sRGB.
    const extreme = resolveColorSpec({ kind: "lab", L: 55, a: -60, b: 40 }, NEUTRAL);
    for (const channel of [extreme.r, extreme.g, extreme.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(channel)).toBe(true);
    }
    expect(Math.max(extreme.r, extreme.g, extreme.b)).toBeCloseTo(1, 6);
  });

  it("accepts a swatch colour eyedropped from a datasheet", () => {
    const swatch = resolveColorSpec({ kind: "srgb", hex: "#8FA9C4" }, NEUTRAL);
    expect(swatch.b).toBeGreaterThan(swatch.r); // cool blue-gray
  });
});

describe("hue previews", () => {
  it("stays displayable for a dark colour, since the UI shows hue not level", () => {
    // A reflected colour at L*30 would render near-black if drawn at its
    // measured level; the preview normalizes so the hue is still readable.
    const hue = resolveColorSpec({ kind: "lab", L: 30, a: 8, b: -6 }, NEUTRAL);
    for (const channel of [hue.r, hue.g, hue.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    expect(Math.max(hue.r, hue.g, hue.b)).toBeCloseTo(1, 6);
  });
});
