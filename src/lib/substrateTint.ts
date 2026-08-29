import {
  SUBSTRATE_INTERNAL_T_6MM,
  linearRGBToHex,
  type RGB,
  type SubstrateTint,
} from "@/engine";

/**
 * Display tint for a substrate: the real 6 mm internal transmittance, viewed
 * through an exaggerated optical path so faint tints stay visible on screen.
 *
 * Raising each channel to the power k is exactly what a k-times-longer path
 * through the glass does (Beer–Lambert), so the hue stays honest — only the
 * apparent depth is exaggerated. k is chosen per substrate so the brightest
 * channel lands near TARGET_FLOOR: near-neutral glass (clear, low-iron) gets
 * the full K_MAX and picks up its faint cast, while an already-dark tint like
 * gray clamps to k = 1 and is never crushed toward black.
 *
 * Exports never use these values — they are for the diagram and the swatch
 * chips only.
 */
const TARGET_FLOOR = 0.55;
const K_MAX = 5;

export function exaggeratedTint(t: RGB): RGB {
  const peak = Math.max(t.r, t.g, t.b);
  const k =
    peak <= 0 || peak >= 1
      ? K_MAX
      : Math.min(K_MAX, Math.max(1, Math.log(TARGET_FLOOR) / Math.log(peak)));
  return { r: t.r ** k, g: t.g ** k, b: t.b ** k };
}

/** Hex the diagram panes and the construction swatch chips share. */
export function substrateDisplayHex(substrate: SubstrateTint): string {
  return linearRGBToHex(exaggeratedTint(SUBSTRATE_INTERNAL_T_6MM[substrate]));
}
