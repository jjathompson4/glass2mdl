import type { RGB } from "../types/optics";

/**
 * Photopic (CIE 1931 Y) weights for linear sRGB primaries. Converting an RGB
 * triple to a single visible-light number uses these, which is what makes
 * "this RGB transmission has a VLT of 62%" meaningful.
 */
export const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

export function luminance(c: RGB): number {
  return LUMINANCE_WEIGHTS.r * c.r + LUMINANCE_WEIGHTS.g * c.g + LUMINANCE_WEIGHTS.b * c.b;
}

export function rgb(r: number, g: number, b: number): RGB {
  return { r, g, b };
}

export function gray(v: number): RGB {
  return { r: v, g: v, b: v };
}

export function mapRGB(c: RGB, f: (v: number) => number): RGB {
  return { r: f(c.r), g: f(c.g), b: f(c.b) };
}

export function zipRGB(a: RGB, b: RGB, f: (x: number, y: number) => number): RGB {
  return { r: f(a.r, b.r), g: f(a.g, b.g), b: f(a.b, b.b) };
}

export const mulRGB = (a: RGB, b: RGB): RGB => zipRGB(a, b, (x, y) => x * y);
export const addRGB = (a: RGB, b: RGB): RGB => zipRGB(a, b, (x, y) => x + y);
export const scaleRGB = (c: RGB, k: number): RGB => mapRGB(c, (v) => v * k);

export function clampRGB(c: RGB, min = 0, max = 1): RGB {
  return mapRGB(c, (v) => Math.min(max, Math.max(min, v)));
}

export function maxChannel(c: RGB): number {
  return Math.max(c.r, c.g, c.b);
}

/**
 * Scale a color so its photopic luminance equals `target`, preserving hue.
 *
 * This is how a scalar cutsheet VLT becomes an RGB transmission: take the
 * substrate's normalized spectral character, then scale it to hit the measured
 * number. If scaling would push any channel above `ceiling`, the color is
 * clamped and desaturated toward neutral so luminance is still met — otherwise
 * a saturated tint could never reach a high VLT.
 */
export function scaleToLuminance(color: RGB, target: number, ceiling = 1): RGB {
  const l = luminance(color);
  if (l <= 0) return gray(Math.min(target, ceiling));

  const scaled = scaleRGB(color, target / l);
  const peak = maxChannel(scaled);
  if (peak <= ceiling) return scaled;

  // Blend toward neutral gray until the peak channel fits under the ceiling.
  // Both endpoints hold luminance = target, so the blend does too.
  const neutral = gray(target);
  const peakNeutral = maxChannel(neutral);
  if (peakNeutral >= ceiling) return clampRGB(neutral, 0, ceiling);

  const blend = (peak - ceiling) / (peak - peakNeutral);
  return clampRGB(zipRGB(scaled, neutral, (s, n) => s + (n - s) * blend), 0, ceiling);
}

/** sRGB transfer function, for turning UI hex colors into linear values. */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function hexToLinearRGB(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return {
    r: srgbToLinear(((n >> 16) & 0xff) / 255),
    g: srgbToLinear(((n >> 8) & 0xff) / 255),
    b: srgbToLinear((n & 0xff) / 255),
  };
}

export function linearRGBToHex(c: RGB): string {
  const ch = (v: number) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}
