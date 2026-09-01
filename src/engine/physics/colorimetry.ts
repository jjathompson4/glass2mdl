import type { ColorSpec } from "../types/color";
import type { RGB } from "../types/optics";
import { clampRGB, hexToLinearRGB, scaleRGB, scaleToLuminance } from "./color";

/**
 * CIE colour conversions for measured glazing colour data.
 *
 * Architectural glass colour is quoted under illuminant D65, and D65 is also
 * the sRGB white point — so Lab converts straight to linear sRGB with no
 * chromatic adaptation step. That is a real simplification, not a shortcut
 * around one.
 */

export interface XYZ {
  X: number;
  Y: number;
  Z: number;
}

/** D65 white point, CIE 1931 2° observer, normalized to Y = 100. */
export const D65_WHITE: XYZ = { X: 95.047, Y: 100, Z: 108.883 };

const DELTA = 6 / 29;

/** Inverse of the CIELAB companding function. */
function labInverse(t: number): number {
  return t > DELTA ? t ** 3 : 3 * DELTA * DELTA * (t - 4 / 29);
}

/** Forward CIELAB companding function. */
function labForward(t: number): number {
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
}

export function labToXYZ(L: number, a: number, b: number, white: XYZ = D65_WHITE): XYZ {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  return {
    X: white.X * labInverse(fx),
    Y: white.Y * labInverse(fy),
    Z: white.Z * labInverse(fz),
  };
}

export function xyzToLab(
  xyz: XYZ,
  white: XYZ = D65_WHITE,
): { L: number; a: number; b: number } {
  const fx = labForward(xyz.X / white.X);
  const fy = labForward(xyz.Y / white.Y);
  const fz = labForward(xyz.Z / white.Z);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Chromaticity plus a luminance to a full tristimulus value. */
export function xyYToXYZ(x: number, y: number, Y = 100): XYZ {
  if (y <= 1e-6) return { X: 0, Y: 0, Z: 0 };
  return { X: (x * Y) / y, Y, Z: ((1 - x - y) * Y) / y };
}

/** sRGB primaries under D65, CIE 1931. Output is linear, not gamma-encoded. */
export function xyzToLinearRGB(xyz: XYZ): RGB {
  const X = xyz.X / 100;
  const Y = xyz.Y / 100;
  const Z = xyz.Z / 100;

  return {
    r: 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    g: -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    b: 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  };
}

export function linearRGBToXYZ(rgb: RGB): XYZ {
  return {
    X: (0.4124564 * rgb.r + 0.3575761 * rgb.g + 0.1804375 * rgb.b) * 100,
    Y: (0.2126729 * rgb.r + 0.7151522 * rgb.g + 0.072175 * rgb.b) * 100,
    Z: (0.0193339 * rgb.r + 0.119192 * rgb.g + 0.9503041 * rgb.b) * 100,
  };
}

/**
 * L* to relative luminance as a 0–1 fraction.
 *
 * This is what makes measured colour cross-checkable against a cutsheet's
 * performance column: L* carries lightness, so a transmitted colour of L*≈87
 * and a visible transmittance of 70% are the same claim stated twice. When
 * they disagree, one of the two was mistyped.
 */
export function lightnessToLuminance(L: number): number {
  return labInverse((L + 16) / 116);
}

/** The inverse, for reporting what L* a given transmittance implies. */
export function luminanceToLightness(Y: number): number {
  return 116 * labForward(Math.max(0, Y)) - 16;
}

/**
 * Resolve a measured colour into a hue.
 *
 * Only the hue is taken: level always comes from the measured transmittance or
 * reflectance, which is the same rule the tint table follows. The returned
 * colour is normalized so its brightest channel is 1, leaving the caller to
 * scale it to the luminance the cutsheet reports.
 *
 * Out-of-gamut results are a normal outcome, not an error — saturated glass
 * colours can sit outside sRGB — so negative channels are clamped rather than
 * rejected.
 */
export function resolveColorSpec(spec: ColorSpec | undefined, fallback: RGB): RGB {
  if (!spec || spec.kind === "auto") return fallback;

  const raw =
    spec.kind === "lab"
      ? xyzToLinearRGB(labToXYZ(spec.L, spec.a, spec.b))
      : spec.kind === "xy"
        ? xyzToLinearRGB(xyYToXYZ(spec.x, spec.y))
        : hexToLinearRGB(spec.hex);

  const clamped = clampRGB(raw, 0, Number.POSITIVE_INFINITY);
  const peak = Math.max(clamped.r, clamped.g, clamped.b);
  if (peak <= 1e-6) return fallback;

  return scaleRGB(clamped, 1 / peak);
}

/**
 * Resolve a colour spec with its level intact: the albedo of a painted or
 * metal finish, where nothing on a data sheet measures the level and the
 * colour is all there is. L* and a swatch carry lightness; chromaticity alone
 * does not, so x,y lands at a mid-grey level with the entered hue.
 */
export function resolveColorSpecAbsolute(spec: ColorSpec | undefined, fallback: RGB): RGB {
  if (!spec || spec.kind === "auto") return fallback;
  if (spec.kind === "xy") {
    return clampRGB(scaleToLuminance(resolveColorSpec(spec, fallback), 0.18), 0, 1);
  }
  const raw =
    spec.kind === "lab" ? xyzToLinearRGB(labToXYZ(spec.L, spec.a, spec.b)) : hexToLinearRGB(spec.hex);
  return clampRGB(raw, 0, 1);
}

/**
 * The luminance a colour spec implies on its own, or undefined when it carries
 * no level information. Only L* does; chromaticity and a normalized swatch do
 * not.
 */
export function impliedLuminance(spec: ColorSpec | undefined): number | undefined {
  if (!spec) return undefined;
  if (spec.kind === "lab") return lightnessToLuminance(spec.L);
  return undefined;
}

/** Describe a spec compactly for generated-file headers and the README. */
export function describeColorSpec(spec: ColorSpec | undefined): string | undefined {
  if (!spec || spec.kind === "auto") return undefined;
  switch (spec.kind) {
    case "lab":
      return `L* ${spec.L.toFixed(1)}, a* ${spec.a.toFixed(1)}, b* ${spec.b.toFixed(1)} (D65)`;
    case "xy":
      return `CIE x ${spec.x.toFixed(4)}, y ${spec.y.toFixed(4)}`;
    case "srgb":
      return `swatch ${spec.hex.toUpperCase()}`;
  }
}
