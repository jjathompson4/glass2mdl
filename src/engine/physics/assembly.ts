import type { RGB } from "../types/optics";
import type { GlazingSystemInput, SurfaceNumber } from "../types/system";
import { SUBSTRATE_INTERNAL_T_6MM, REFERENCE_THICKNESS_M } from "./constants";
import { luminance, mulRGB, scaleToLuminance, gray } from "./color";
import { resolveColorSpec } from "./colorimetry";
import {
  bareInterface,
  fitLiteFaces,
  fitLiteFacesConstrained,
  retargetThickness,
  slabOptics,
  solveIncreasing,
  stackAll,
  type OpticalInterface,
  type ScalarOptics,
} from "./slab";

/**
 * Decomposing a cutsheet into per-lite optical properties.
 *
 * A cutsheet reports the whole assembly: one Tvis, one exterior reflectance,
 * one interior reflectance. The renderer needs properties per lite. That
 * inverse problem is underdetermined in general, so the model is pinned down
 * as follows: substrates take their nominal absorption from the tint table,
 * and the coating carries the three free parameters (transmittance, and a
 * reflectance from each side) that close the three measurements. With no
 * coating present there is one free parameter — a common substrate absorption
 * scale — which honors Tvis exactly and leaves the reflectances to fall where
 * the physics puts them, with the residual reported rather than hidden.
 */

/** Which lite a surface number belongs to, and which of its faces. */
export function locateSurface(surface: SurfaceNumber): { lite: number; face: "front" | "back" } {
  return { lite: Math.floor((surface - 1) / 2), face: (surface - 1) % 2 === 0 ? "front" : "back" };
}

/** Highest valid surface number for a given lite count. */
export function maxSurface(liteCount: number): number {
  return liteCount * 2;
}

export interface ChannelLiteModel {
  thicknessM: number;
  /** Nominal internal transmittance for this lite at its actual thickness. */
  nominalInternalT: number;
}

export interface ChannelFit {
  internalT: number[];
  coating?: OpticalInterface;
  achieved: ScalarOptics;
}

interface CoatingLocation {
  lite: number;
  face: "front" | "back";
}

function evaluate(
  lites: ChannelLiteModel[],
  internalT: number[],
  coatingAt: CoatingLocation | undefined,
  coating: OpticalInterface | undefined,
): ScalarOptics {
  const elements = lites.map((_, i) => {
    const front =
      coatingAt && coating && coatingAt.lite === i && coatingAt.face === "front"
        ? coating
        : bareInterface();
    const back =
      coatingAt && coating && coatingAt.lite === i && coatingAt.face === "back"
        ? coating
        : bareInterface();
    return slabOptics(internalT[i], front, back);
  });
  return stackAll(elements);
}

const MAX_COATING_R = 0.95;

/** Coating properties held fixed rather than solved for, per channel. */
export interface PinnedCoating {
  tau?: number;
  rExt?: number;
  rInt?: number;
}

/** Fit one colour channel. */
export function fitChannel(
  lites: ChannelLiteModel[],
  coatingAt: CoatingLocation | undefined,
  target: ScalarOptics,
  pinned: PinnedCoating = {},
): ChannelFit {
  if (!coatingAt) {
    // One free parameter: a common exponent on substrate absorption. Larger
    // exponent means more absorption, so assembly transmittance decreases —
    // monotonic, hence solvable by bisection on its negation.
    const withScale = (k: number) => lites.map((l) => Math.pow(l.nominalInternalT, k));
    const tAt = (k: number) => -evaluate(lites, withScale(k), undefined, undefined).t;
    const k = solveIncreasing(tAt, -target.t, 0.02, 60);
    const internalT = withScale(k);
    return { internalT, achieved: evaluate(lites, internalT, undefined, undefined) };
  }

  const internalT = lites.map((l) => l.nominalInternalT);
  const coating: OpticalInterface = {
    rExt: pinned.rExt ?? Math.min(target.rFront, MAX_COATING_R),
    rInt: pinned.rInt ?? Math.min(target.rBack, MAX_COATING_R),
    tau: pinned.tau ?? 0.85,
  };

  // Coordinate descent: each unknown is monotonic in the measurement it owns
  // (tau→T, rExt→Rf, rInt→Rb), so cycling bisections converges quickly. Pinned
  // parameters are skipped, leaving the rest to absorb what they can.
  for (let sweep = 0; sweep < 24; sweep++) {
    if (pinned.tau === undefined) {
      const tauCeiling = Math.max(0.001, 1 - Math.max(coating.rExt, coating.rInt));
      coating.tau = solveIncreasing(
        (tau) => evaluate(lites, internalT, coatingAt, { ...coating, tau }).t,
        target.t,
        0.001,
        tauCeiling,
      );
    }

    if (pinned.rExt === undefined) {
      coating.rExt = solveIncreasing(
        (rExt) => evaluate(lites, internalT, coatingAt, { ...coating, rExt }).rFront,
        target.rFront,
        0,
        MAX_COATING_R,
      );
    }

    if (pinned.rInt === undefined) {
      coating.rInt = solveIncreasing(
        (rInt) => evaluate(lites, internalT, coatingAt, { ...coating, rInt }).rBack,
        target.rBack,
        0,
        MAX_COATING_R,
      );
    }
  }

  return {
    internalT,
    coating,
    achieved: evaluate(lites, internalT, coatingAt, coating),
  };
}

export interface AssemblyFit {
  /** Per-lite internal transmittance, RGB. */
  internalT: RGB[];
  coating?: { location: CoatingLocation; rExt: RGB; rInt: RGB; tau: RGB };
  achieved: { t: RGB; rFront: RGB; rBack: RGB };
  targets: { t: RGB; rFront: RGB; rBack: RGB };
}

/** Nominal internal transmittance of one lite at its actual thickness. */
export function nominalLiteTransmittance(
  substrate: keyof typeof SUBSTRATE_INTERNAL_T_6MM,
  thicknessMm: number,
): RGB {
  const ref = SUBSTRATE_INTERNAL_T_6MM[substrate];
  const thicknessM = thicknessMm / 1000;
  return {
    r: retargetThickness(ref.r, REFERENCE_THICKNESS_M, thicknessM),
    g: retargetThickness(ref.g, REFERENCE_THICKNESS_M, thicknessM),
    b: retargetThickness(ref.b, REFERENCE_THICKNESS_M, thicknessM),
  };
}

/**
 * The hue the substrate tints alone imply, used wherever no colour was
 * measured and as the swatch preview's starting point.
 */
export function nominalAssemblyHue(lites: GlazingSystemInput["lites"]): RGB {
  return lites
    .map((l) => nominalLiteTransmittance(l.substrate, l.thickness))
    .reduce((acc, t) => mulRGB(acc, t), gray(1));
}

/**
 * The photopic assembly optics the nominal, uncoated construction produces on
 * its own — bare interfaces around tint-table bodies, stacked.
 *
 * These are the physically natural values for a build-up, always reachable by
 * the fit (a coating only widens what is reachable), which makes them the
 * right performance defaults to hold until the user enters real cutsheet
 * numbers: the tool should never open in a state its own physics calls wrong.
 */
export function naturalAssemblyOptics(lites: GlazingSystemInput["lites"]): {
  tvis: number;
  rvisExt: number;
  rvisInt: number;
} {
  const channels = ["r", "g", "b"] as const;
  const nominal = lites.map((l) => nominalLiteTransmittance(l.substrate, l.thickness));
  const per = channels.map((c) =>
    stackAll(lites.map((_, i) => slabOptics(nominal[i][c], bareInterface(), bareInterface()))),
  );
  const photopic = (get: (o: ScalarOptics) => number) =>
    luminance({ r: get(per[0]), g: get(per[1]), b: get(per[2]) });
  return {
    tvis: photopic((o) => o.t),
    rvisExt: photopic((o) => o.rFront),
    rvisInt: photopic((o) => o.rBack),
  };
}

/**
 * Turn the scalar cutsheet measurements into RGB targets, then fit each channel
 * independently.
 *
 * Hue comes from the model (substrate tints for transmission, the coating's
 * reflected colour for reflection); level comes from the measured numbers. That
 * split is what lets one photopic value per quantity drive a coloured result.
 */
export function fitAssembly(input: GlazingSystemInput): AssemblyFit {
  const { lites, assembly, frit } = input;

  const nominal = lites.map((l) => nominalLiteTransmittance(l.substrate, l.thickness));
  const combinedHue = nominal.reduce((acc, t) => mulRGB(acc, t), gray(1));

  const coatedLite = lites.findIndex((l) => l.coating);
  const coating = coatedLite >= 0 ? lites[coatedLite].coating : undefined;
  const coatingAt = coating ? locateSurface(coating.surface) : undefined;
  const coatingHue = coating?.reflectedColor ?? gray(1);

  // Frit blocks part of the aperture. The cutsheet's Tvis is for the vision
  // area, so the fit targets the unfritted glazing and frit is layered on top.
  void frit;

  // Measured colour supplies hue wherever it was given; the nominal substrate
  // product and the coating's own colour are the fallbacks. Level always comes
  // from the performance values, never from the colour.
  const transmitHue = resolveColorSpec(assembly.transmittedColor, combinedHue);
  const reflectHueExt = resolveColorSpec(assembly.reflectedColorExt, coatingHue);
  const reflectHueInt = resolveColorSpec(assembly.reflectedColorInt, coatingHue);

  const targets = {
    t: scaleToLuminance(transmitHue, assembly.tvis, 0.999),
    rFront: scaleToLuminance(reflectHueExt, assembly.rvisExt, MAX_COATING_R),
    rBack: scaleToLuminance(reflectHueInt, assembly.rvisInt, MAX_COATING_R),
  };

  const overrides = coating?.overrides;
  const channels = ["r", "g", "b"] as const;
  const fits = channels.map((c) =>
    fitChannel(
      lites.map((l, i) => ({
        thicknessM: l.thickness / 1000,
        nominalInternalT: nominal[i][c],
      })),
      coatingAt,
      { t: targets.t[c], rFront: targets.rFront[c], rBack: targets.rBack[c] },
      {
        tau: overrides?.transmission?.[c],
        rExt: overrides?.reflectanceExt?.[c],
        rInt: overrides?.reflectanceInt?.[c],
      },
    ),
  );

  const pick = (get: (f: ChannelFit) => number): RGB => ({
    r: get(fits[0]),
    g: get(fits[1]),
    b: get(fits[2]),
  });

  return {
    internalT: lites.map((_, i) => ({
      r: fits[0].internalT[i],
      g: fits[1].internalT[i],
      b: fits[2].internalT[i],
    })),
    coating:
      coatingAt && fits[0].coating
        ? {
            location: coatingAt,
            rExt: pick((f) => f.coating!.rExt),
            rInt: pick((f) => f.coating!.rInt),
            tau: pick((f) => f.coating!.tau),
          }
        : undefined,
    achieved: {
      t: pick((f) => f.achieved.t),
      rFront: pick((f) => f.achieved.rFront),
      rBack: pick((f) => f.achieved.rBack),
    },
    targets,
  };
}

/**
 * Lite-level aggregate optics of one lite in a fit: its two interfaces (the
 * fitted coating where it sits, bare glass elsewhere) around the fitted body.
 * These are the per-lite values whose stack reproduces the achieved assembly.
 */
export function liteAggregateOptics(
  fit: AssemblyFit,
  lite: number,
): { t: RGB; rFront: RGB; rBack: RGB } {
  const at = fit.coating?.location;
  const channels = ["r", "g", "b"] as const;

  const per = channels.map((c) => {
    const coatingInterface: OpticalInterface | undefined = fit.coating
      ? { rExt: fit.coating.rExt[c], rInt: fit.coating.rInt[c], tau: fit.coating.tau[c] }
      : undefined;
    const front =
      at && at.lite === lite && at.face === "front" && coatingInterface
        ? coatingInterface
        : bareInterface();
    const back =
      at && at.lite === lite && at.face === "back" && coatingInterface
        ? coatingInterface
        : bareInterface();
    return slabOptics(fit.internalT[lite][c], front, back);
  });

  return {
    t: { r: per[0].t, g: per[1].t, b: per[2].t },
    rFront: { r: per[0].rFront, g: per[1].rFront, b: per[2].rFront },
    rBack: { r: per[0].rBack, g: per[1].rBack, b: per[2].rBack },
  };
}

/**
 * fitLiteFaces per channel — see slab.ts for what this inverts and why.
 *
 * The emitted face is one custom_curve_layer per side: a scalar reflectivity
 * (the RGB peak) times a normalised tint, transmitting the scalar complement.
 * After an unconstrained first pass establishes the peaks, each channel is
 * re-fitted with its face transmittance pinned to those scalars, so what the
 * layer actually passes — not an idealised per-channel complement — is what
 * the solved body transmittance compensates. Peaks are re-derived between
 * sweeps; they move negligibly, so two refinement rounds settle it.
 */
export function fitLiteFacesRGB(aggregate: {
  t: RGB;
  rFront: RGB;
  rBack: RGB;
}): { rFront: RGB; rBack: RGB; internalT: RGB } {
  const channels = ["r", "g", "b"] as const;
  const targets = channels.map((c) => ({
    t: aggregate.t[c],
    rFront: aggregate.rFront[c],
    rBack: aggregate.rBack[c],
  }));

  let per = targets.map((t) => fitLiteFaces(t));

  for (let round = 0; round < 2; round++) {
    const tauFront = 1 - Math.max(...per.map((p) => p.rFront));
    const tauBack = 1 - Math.max(...per.map((p) => p.rBack));
    per = targets.map((t) => fitLiteFacesConstrained(t, tauFront, tauBack));
  }

  return {
    rFront: { r: per[0].rFront, g: per[1].rFront, b: per[2].rFront },
    rBack: { r: per[0].rBack, g: per[1].rBack, b: per[2].rBack },
    internalT: { r: per[0].internalT, g: per[1].internalT, b: per[2].internalT },
  };
}

/** Photopic residual of a fit against the numbers the user typed in. */
export function fitResidual(fit: AssemblyFit, input: GlazingSystemInput) {
  const tvis = luminance(fit.achieved.t) - input.assembly.tvis;
  const rvisExt = luminance(fit.achieved.rFront) - input.assembly.rvisExt;
  const rvisInt = luminance(fit.achieved.rBack) - input.assembly.rvisInt;
  return {
    tvis,
    rvisExt,
    rvisInt,
    max: Math.max(Math.abs(tvis), Math.abs(rvisExt), Math.abs(rvisInt)),
  };
}
