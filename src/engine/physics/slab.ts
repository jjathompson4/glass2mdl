import { AIR_GLASS_R0 } from "./constants";

/**
 * Scalar (single-channel) slab and interface optics.
 *
 * Everything here is incoherent: glazing lites are thousands of wavelengths
 * thick, so intensities add rather than amplitudes. All quantities are
 * normal-incidence.
 */

/**
 * A boundary — bare glass/air, or a coating deposited on one. `tau` is the same
 * in both directions (reciprocity); reflectance need not be, because real
 * coatings look different from inside than out.
 */
export interface OpticalInterface {
  /** Reflectance for light arriving from the exterior-facing side. */
  rExt: number;
  /** Reflectance for light arriving from the interior-facing side. */
  rInt: number;
  /** Transmittance, identical both directions. */
  tau: number;
}

/** Scalar optical triple for any element or stack. */
export interface ScalarOptics {
  t: number;
  rFront: number;
  rBack: number;
}

export const bareInterface = (): OpticalInterface => ({
  rExt: AIR_GLASS_R0,
  rInt: AIR_GLASS_R0,
  tau: 1 - AIR_GLASS_R0,
});

/**
 * Optics of one lite: two interfaces separated by an absorbing body of internal
 * transmittance `t`, summing the infinite series of internal bounces.
 */
export function slabOptics(
  internalT: number,
  front: OpticalInterface,
  back: OpticalInterface,
): ScalarOptics {
  const t2 = internalT * internalT;
  const denom = 1 - front.rInt * back.rExt * t2;
  if (denom <= 1e-12) return { t: 0, rFront: front.rExt, rBack: back.rInt };

  return {
    t: (front.tau * internalT * back.tau) / denom,
    rFront: front.rExt + (front.tau * front.tau * back.rExt * t2) / denom,
    rBack: back.rInt + (back.tau * back.tau * front.rInt * t2) / denom,
  };
}

/**
 * Combine two elements separated by a non-absorbing gap (or in contact), the
 * standard net-radiation result also used by LBNL WINDOW to build up IGUs.
 */
export function stackTwo(a: ScalarOptics, b: ScalarOptics): ScalarOptics {
  const denom = 1 - a.rBack * b.rFront;
  if (denom <= 1e-12) return { t: 0, rFront: a.rFront, rBack: b.rBack };

  return {
    t: (a.t * b.t) / denom,
    rFront: a.rFront + (a.t * a.t * b.rFront) / denom,
    rBack: b.rBack + (b.t * b.t * a.rBack) / denom,
  };
}

export function stackAll(elements: ScalarOptics[]): ScalarOptics {
  if (elements.length === 0) return { t: 1, rFront: 0, rBack: 0 };
  return elements.reduce(stackTwo);
}

/**
 * Bisection for a monotonically increasing function. Out-of-range targets
 * return the nearest bound, which is the "closest physically achievable"
 * behavior the UI reports as a residual instead of failing outright.
 */
export function solveIncreasing(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  iterations = 40,
): number {
  if (f(lo) >= target) return lo;
  if (f(hi) <= target) return hi;

  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (f(mid) < target) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

const MAX_FACE_R = 0.95;

/**
 * Invert a lite's aggregate optics into the two face reflectivities and body
 * transmittance whose *rendered composition* reproduces them.
 *
 * A coated solid is emitted with both faces replaced — a fitted Schlick layer
 * over a transmit-only base, one value per Material ID — around an absorbing
 * body. The renderer then sums the bounces between those faces itself, so the
 * baked numbers must be the ones whose composition equals the lite's fitted
 * aggregate, not the aggregate values themselves. Each emitted face passes
 * exactly what it does not reflect, making the rendered lite
 * `slabOptics(t, symmetric(rFront), symmetric(rBack))`; this inverts that by
 * the same coordinate descent the assembly fit uses, since each unknown is
 * monotonic in the measurement it owns.
 */
export function fitLiteFaces(target: ScalarOptics): {
  rFront: number;
  rBack: number;
  internalT: number;
} {
  const symmetric = (r: number): OpticalInterface => ({ rExt: r, rInt: r, tau: 1 - r });
  const rendered = (rf: number, rb: number, t: number) =>
    slabOptics(t, symmetric(rf), symmetric(rb));

  let rFront = Math.min(target.rFront, MAX_FACE_R);
  let rBack = Math.min(target.rBack, MAX_FACE_R);
  let internalT = Math.min(1, Math.max(1e-4, target.t));

  for (let sweep = 0; sweep < 24; sweep++) {
    internalT = solveIncreasing(
      (t) => rendered(rFront, rBack, t).t,
      target.t,
      1e-4,
      1,
    );
    rFront = solveIncreasing(
      (r) => rendered(r, rBack, internalT).rFront,
      target.rFront,
      0,
      MAX_FACE_R,
    );
    rBack = solveIncreasing(
      (r) => rendered(rFront, r, internalT).rBack,
      target.rBack,
      0,
      MAX_FACE_R,
    );
  }

  return { rFront, rBack, internalT };
}

/**
 * fitLiteFaces against faces whose transmittance is *fixed* rather than the
 * complement of their reflectance.
 *
 * MDL's custom_curve_layer passes the scalar `1 - normal_reflectivity`
 * through regardless of the reflect tint, so a coloured face reflects
 * `w * tint[c]` per channel but still transmits only `1 - w`: the non-peak
 * channels absorb the difference. Fitting each channel with its face
 * transmittance pinned to the scalar the emitted layer will actually use
 * pushes that loss into the solved body transmittance, where the volume can
 * compensate per channel.
 */
export function fitLiteFacesConstrained(
  target: ScalarOptics,
  tauFront: number,
  tauBack: number,
): { rFront: number; rBack: number; internalT: number } {
  const rendered = (rf: number, rb: number, t: number) =>
    slabOptics(
      t,
      { rExt: rf, rInt: rf, tau: tauFront },
      { rExt: rb, rInt: rb, tau: tauBack },
    );

  let rFront = Math.min(target.rFront, MAX_FACE_R);
  let rBack = Math.min(target.rBack, MAX_FACE_R);
  let internalT = Math.min(1, Math.max(1e-4, target.t));

  for (let sweep = 0; sweep < 24; sweep++) {
    internalT = solveIncreasing((t) => rendered(rFront, rBack, t).t, target.t, 1e-4, 1);
    rFront = solveIncreasing(
      (r) => rendered(r, rBack, internalT).rFront,
      target.rFront,
      0,
      MAX_FACE_R,
    );
    rBack = solveIncreasing(
      (r) => rendered(rFront, r, internalT).rBack,
      target.rBack,
      0,
      MAX_FACE_R,
    );
  }

  return { rFront, rBack, internalT };
}

/**
 * Invert the bare-lite relation T = (1-r)^2 t / (1 - r^2 t^2) for the internal
 * transmittance t, given a measured total transmittance.
 *
 * Rearranges to the quadratic (T r^2) t^2 + (1-r)^2 t - T = 0 and takes the
 * positive root — the same inversion Radiance uses to turn a glass pane's
 * measured transmittance into its transmissivity.
 */
export function internalTransmittanceFromTotal(totalT: number, r = AIR_GLASS_R0): number {
  if (totalT <= 0) return 0;

  const a = totalT * r * r;
  const b = (1 - r) ** 2;
  if (a <= 1e-15) return Math.min(1, totalT / b); // no meaningful inter-reflection

  const t = (-b + Math.sqrt(b * b + 4 * a * totalT)) / (2 * a);
  return Math.min(1, Math.max(0, t));
}

/** Beer-Lambert: internal transmittance over `thicknessM` → absorption in 1/m. */
export function absorptionCoefficient(internalT: number, thicknessM: number): number {
  if (thicknessM <= 0) return 0;
  const clamped = Math.min(1, Math.max(1e-6, internalT));
  return -Math.log(clamped) / thicknessM;
}

/** Beer-Lambert, the other way: absorption in 1/m over a thickness → transmittance. */
export function internalTransmittanceAt(coefficientPerM: number, thicknessM: number): number {
  return Math.exp(-coefficientPerM * thicknessM);
}

/** Rescale a reference-thickness internal transmittance to another thickness. */
export function retargetThickness(
  referenceT: number,
  referenceThicknessM: number,
  thicknessM: number,
): number {
  return internalTransmittanceAt(
    absorptionCoefficient(referenceT, referenceThicknessM),
    thicknessM,
  );
}
