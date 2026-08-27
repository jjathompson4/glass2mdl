import { fitAssembly } from "../physics/assembly";
import { GLASS_IOR } from "../physics/constants";
import { toIdentifier } from "../mdl/naming";
import type { LayerIR, MaterialIR } from "../types/ir";
import type { GlazingSystemInput } from "../types/system";
import type { SolverWarning } from "../types/issues";
import type { DerivedOptics } from "../types/optics";
import { buildDerived, coatingLayer, compensateForLayer, provenanceComments } from "./common";
import { lowerFrit } from "./frit";
import { applyRollerWave } from "./rollerWave";

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
    textures.push(...applyRollerWave([material], input.rollerWave).textures);
    notes.push(
      "Roller wave assumes 1 UV unit = 1 meter (a 1 m x 1 m UVW Map, or Real-World Map Size).",
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
  return { materials: [material], derived: buildDerived(input, fit), warnings, textures };
}
