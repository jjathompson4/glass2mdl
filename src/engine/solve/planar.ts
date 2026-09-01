import { fitAssembly, spandrelAppearance, type AssemblyFit, type SpandrelAppearance } from "../physics/assembly";
import { clampRGB, gray, luminance, zipRGB } from "../physics/color";
import { GLASS_IOR } from "../physics/constants";
import { toIdentifier } from "../mdl/naming";
import type { LayerIR, MaterialIR } from "../types/ir";
import type { GlazingSystemInput, SpandrelInput } from "../types/system";
import type { SolverWarning } from "../types/issues";
import type { DerivedOptics } from "../types/optics";
import {
  buildDerived,
  coatingLayer,
  compensateForLayer,
  describeFinish,
  finishLayer,
  provenanceComments,
} from "./common";
import { lowerFrit } from "./frit";
import { rollerWaveTexture } from "./rollerWave";

export interface SolveOutput {
  materials: MaterialIR[];
  derived: DerivedOptics;
  warnings: SolverWarning[];
  /** Files that must ship next to the .mdl. */
  textures: { fileName: string; bytes: Uint8Array }[];
}

/**
 * Planar export: the whole assembly as one zero-thickness surface.
 *
 * The cutsheet's numbers already include every inter-reflection between lites,
 * so no decomposition is needed for appearance — the measured transmittance and
 * reflectance are reproduced directly on a thin-walled material. Being
 * thin-walled also unlocks MDL's `backface`, so the interior side gets its own
 * reflectance, which the volumetric path cannot do.
 */
export function solvePlanar(input: GlazingSystemInput): SolveOutput {
  const fit = fitAssembly(input);
  const warnings: SolverWarning[] = [];

  const spandrel = spandrelAppearance(fit, input);
  if (input.spandrel?.kind === "flood-coat" && spandrel) {
    return floodCoatPlanar(input, input.spandrel, fit, spandrel);
  }

  const notes: string[] = [
    "Apply to a single flat surface with no thickness. Do not use on a solid.",
    "Interior appearance comes from the material's backface; keep face normals pointing outward.",
  ];

  // The reflection layer sits over a pure transmitter that contributes no
  // reflection of its own, so no reflectance compensation is needed here — but
  // the transmission underneath must be raised by what the layer holds back.
  const front = coatingLayer(fit.achieved.rFront);
  const back = coatingLayer(fit.achieved.rBack);

  const frontTint = compensateForLayer(fit.achieved.t, front.normalReflectivity);
  const backTint = compensateForLayer(fit.achieved.t, back.normalReflectivity);

  if (frontTint.clamped || backTint.clamped) {
    warnings.push({
      code: "transmittance-unreachable",
      message:
        "This combination of transmittance and reflectance sits at the edge of what a single surface can do, so transmittance was capped. The rendered glass will read slightly darker than the cutsheet.",
    });
  }

  const layers: LayerIR[] = [
    front,
    { kind: "specular-base", tint: frontTint.tint, scatterMode: "transmit" },
  ];
  const backLayers: LayerIR[] = [
    back,
    { kind: "specular-base", tint: backTint.tint, scatterMode: "transmit" },
  ];

  const prefix = toIdentifier(input.name);
  const material: MaterialIR = {
    name: `${prefix}_planar`,
    displayName: `${input.name} (planar)`,
    description: "Whole glazing assembly as a single thin surface.",
    thinWalled: true,
    ior: GLASS_IOR,
    layers,
    backface: { layers: backLayers },
    params: [],
    moduleFunctions: [],
    comments: [],
  };

  const textures: { fileName: string; bytes: Uint8Array }[] = [];
  if (input.rollerWave) {
    textures.push(rollerWaveTexture());
    notes.push(
      "Roller wave: wire the bundled roller_wave_bump.png into the material's geometry normal channel in Max (see the README). Assumes 1 UV unit = 1 meter.",
    );
  }

  // In planar mode the assembly is already collapsed to one surface, so there
  // is no surface for frit to sit on relative to anything else — it belongs in
  // the material, layered over the glazing.
  if (input.frit) {
    const lowered = lowerFrit(input.frit, prefix);
    material.layers = [
      { kind: "frit", color: input.frit.color, opacity: input.frit.opacity, weight: lowered.weight },
      ...layers,
    ];
    material.backface = {
      layers: [
        { kind: "frit", color: input.frit.color, opacity: input.frit.opacity, weight: lowered.weight },
        ...backLayers,
      ],
    };
    material.moduleFunctions = [...material.moduleFunctions, ...lowered.moduleFunctions];
    if (lowered.moduleFunctions.length) {
      material.params = [
        ...material.params,
        {
          name: "frit_pattern_scale",
          type: "float",
          defaultValue: 1,
          displayName: "Frit pattern scale",
          description:
            "Multiplies the pattern's physical size. Leave at 1.0 when the object uses a 1 m x 1 m UVW map.",
        },
      ];
      notes.push(
        "Frit pattern assumes 1 UV unit = 1 meter (a 1 m x 1 m UVW Map, or Real-World Map Size).",
        "If the pattern looks the wrong size in Max, adjust frit_pattern_scale rather than regenerating.",
      );
    }
    material.description += ` Includes ${input.frit.pattern.kind} frit.`;

    warnings.push({
      code: "frit-vision-area",
      message:
        "Cutsheet transmittance describes the vision area, so frit is layered over glazing fitted to those numbers. Overall transmittance through the fritted area will read lower, as it should.",
      });

    const derived = buildDerived(input, fit);
    material.comments = [...provenanceComments(input, "planar", fit, notes), ...material.comments];
    return {
      materials: [material],
      derived,
      warnings,
      textures: [...textures, ...lowered.textures],
    };
  }

  material.comments = [...provenanceComments(input, "planar", fit, notes), ...material.comments];
  const materials = [material];

  // Shadow box: the glass plane keeps the ordinary planar material; the pan
  // is a second plane behind it with its own opaque material.
  if (input.spandrel?.kind === "back-pan" && spandrel) {
    const pan = input.spandrel;
    materials.push({
      name: `${prefix}_pan`,
      displayName: `${input.name} - back pan`,
      description: `${pan.finish} back pan, ${pan.cavity}mm behind the glass`,
      thinWalled: true,
      ior: GLASS_IOR,
      layers: [finishLayer(pan, spandrel.finish)],
      params: [],
      moduleFunctions: [],
      comments: provenanceComments(input, "planar", fit, [
        `Apply to a second plane ${pan.cavity}mm behind the glass plane, facing outward, matching its outline.`,
        `${describeFinish(pan, spandrel.finish)}. Seen from outside through the glass the panel reads as ${(luminance(spandrel.readsAs) * 100).toFixed(1)}%.`,
      ]),
    });
    warnings.push({
      code: "spandrel-pan-plane",
      message: `The back pan exports as its own material (${prefix}_pan) for a second plane ${pan.cavity}mm behind the glass plane. The README has the placement.`,
    });
  }

  return { materials, derived: buildDerived(input, fit), warnings, textures };
}

/**
 * A flood-coated spandrel as one opaque surface: the glass stack's own
 * reflection sits in the Fresnel layer, and whatever the paint adds through
 * the glass sits in a diffuse base underneath, pre-divided by what the layer
 * holds back so the two compose to the reads-as colour. Nothing transmits;
 * the interior side is the dark nothing behind a spandrel.
 */
function floodCoatPlanar(
  input: GlazingSystemInput,
  spandrel: SpandrelInput & { kind: "flood-coat" },
  fit: AssemblyFit,
  appearance: SpandrelAppearance,
): SolveOutput {
  const front = coatingLayer(appearance.glassOnly);
  const added = clampRGB(zipRGB(appearance.readsAs, appearance.glassOnly, (a, b) => a - b), 0, 1);
  const base = compensateForLayer(added, front.normalReflectivity);

  const layers: LayerIR[] = [front, { kind: "diffuse", color: base.tint }];
  const backLayers: LayerIR[] = [{ kind: "diffuse", color: gray(0.06) }];

  const notes: string[] = [
    "Apply to a single flat surface with no thickness. Do not use on a solid.",
    `Opaque spandrel: the whole build-up over a ${describeFinish(spandrel, appearance.finish)}, collapsed to one surface. Nothing transmits.`,
    `Seen from outside the panel reads as ${(luminance(appearance.readsAs) * 100).toFixed(1)}%; the finish colour is taken as given, since no data sheet measures it.`,
    "The interior side is a dark neutral: what sits behind a spandrel is insulation or a pan, never glass.",
  ];

  const textures: { fileName: string; bytes: Uint8Array }[] = [];
  if (input.rollerWave) {
    textures.push(rollerWaveTexture());
    notes.push(
      "Roller wave: wire the bundled roller_wave_bump.png into the material's geometry normal channel in Max (see the README). Assumes 1 UV unit = 1 meter.",
    );
  }

  const prefix = toIdentifier(input.name);
  const material: MaterialIR = {
    name: `${prefix}_planar`,
    displayName: `${input.name} (planar)`,
    description: `Spandrel: whole build-up plus flood coat on #${spandrel.surface}, as a single opaque surface.`,
    thinWalled: true,
    ior: GLASS_IOR,
    layers,
    backface: { layers: backLayers },
    params: [],
    moduleFunctions: [],
    comments: provenanceComments(input, "planar", fit, notes),
  };

  return { materials: [material], derived: buildDerived(input, fit), warnings: [], textures };
}
