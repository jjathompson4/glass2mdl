import { luminance, type DerivedOptics } from "@/engine";

/** The three cutsheet quantities, paired with the recomputed field that must reproduce each. */
export const FIT_QUANTITIES = [
  { key: "tvis", produced: "t", label: "Transmittance" },
  { key: "rvisExt", produced: "rFront", label: "Reflectance, exterior" },
  { key: "rvisInt", produced: "rBack", label: "Reflectance, interior" },
] as const;

export type FitTone = "exact" | "close" | "off";

export interface FitVerdict {
  tone: FitTone;
  /** Full sentence for the fit-check details. */
  title: string;
  /** Short form for the always-visible chip in the diagram panel. */
  chip: string;
  /** The quantity furthest from its entered value. */
  worst: (typeof FIT_QUANTITIES)[number];
}

/**
 * One verdict, computed once, shown in two places: the chip pinned beside the
 * diagram and the fit-check disclosure in the Download card. Sharing it means
 * the two can never disagree about whether the numbers worked.
 */
export function fitVerdict(
  derived: DerivedOptics,
  assembly: { tvis: number; rvisExt: number; rvisInt: number },
): FitVerdict {
  const residual = derived.residual;
  const worst = FIT_QUANTITIES.reduce((a, b) =>
    Math.abs(residual[a.key]) >= Math.abs(residual[b.key]) ? a : b,
  );

  // "Exactly" is only claimed when the table visibly agrees at one decimal —
  // a green chip next to 7.9% vs 7.8% reads as a lie even at 0.06 points.
  const displayAgrees = FIT_QUANTITIES.every(
    ({ key, produced }) =>
      (assembly[key] * 100).toFixed(1) ===
      (luminance(derived.recomputed[produced]) * 100).toFixed(1),
  );

  if (residual.max < 0.001 && displayAgrees) {
    return {
      tone: "exact",
      title: "The materials reproduce your numbers exactly",
      chip: "reproduced exactly",
      worst,
    };
  }
  if (residual.max < 0.02) {
    const off = `${(residual.max * 100).toFixed(1)}%`;
    return {
      tone: "close",
      title: `Within ${off} of intended values`,
      chip: `within ${off} of intended values`,
      worst,
    };
  }
  const off = `${(Math.abs(residual[worst.key]) * 100).toFixed(1)}%`;
  return {
    tone: "off",
    title: `Closest match is ${off} off on ${worst.label.toLowerCase()}`,
    chip: `${off} off on ${worst.label.toLowerCase()}`,
    worst,
  };
}
