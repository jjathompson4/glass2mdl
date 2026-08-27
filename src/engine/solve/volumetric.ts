import { fitAssembly, fitLiteFacesRGB, liteAggregateOptics, locateSurface } from "../physics/assembly";
import { GLASS_IOR, SUBSTRATE_LABELS } from "../physics/constants";
import { INTERIOR_FACE_PARAM } from "../mdl/emit/layers";
import { litePositionNames, toIdentifier, uniquify } from "../mdl/naming";
import type { LayerIR, MaterialIR, MaterialParamIR } from "../types/ir";
import type { GlazingSystemInput } from "../types/system";
import type { SolverWarning } from "../types/issues";
import { buildDerived, coatingLayer, provenanceComments, volumeAbsorption } from "./common";
import { lowerFrit } from "./frit";
import { rollerWaveTexture } from "./rollerWave";
import type { SolveOutput } from "./planar";

/**
 * Volumetric export: every lite is a closed solid, so each gets its own
 * material and the glass color comes from volume absorption rather than a
 * surface tint. Light physically travels through the gaps, which is what makes
 * this mode worth its extra setup — reflections stack the way real IGUs do.
 */
export function solveVolumetric(input: GlazingSystemInput): SolveOutput {
  const fit = fitAssembly(input);
  const warnings: SolverWarning[] = [];
  const prefix = toIdentifier(input.name);
  const positions = litePositionNames(input.lites.length);

  const materials: MaterialIR[] = input.lites.map((lite, i) => {
    const isCoated = fit.coating?.location.lite === i;
    const layers: LayerIR[] = [];
    const params: MaterialParamIR[] = [];
    let internalT = fit.internalT[i];

    if (isCoated && fit.coating) {
      // The render-validated coated-solid structure (docs/iray-findings.md
      // §9.6, per-lite decision 2026-08-24): both faces replace the interface
      // — a fitted Schlick layer over a transmit-only base, selected per
      // Material ID by the interior_face parameter — with body absorption in
      // the volume all face IDs share. The coating owns reflection outright
      // because layering can only ever add, and real low-e coatings reflect
      // *less* than bare glass — Solarban 60 sends back 11% where uncoated
      // double glazing sends back about 14%. Refraction is unaffected: a
      // transmit-only specular BSDF still bends light by the material IOR.
      //
      // The face values are not the lite's aggregate optics: the renderer
      // sums the bounces between the two fitted faces itself, so the baked
      // numbers are the inverse — see fitLiteFaces in physics/slab.ts.
      const faces = fitLiteFacesRGB(liteAggregateOptics(fit, i));
      const exterior = coatingLayer(faces.rFront);
      const interior = coatingLayer(faces.rBack);
      layers.push({
        ...exterior,
        interiorVariant: {
          normalReflectivity: interior.normalReflectivity,
          reflectColor: interior.reflectColor,
        },
      });
      layers.push({ kind: "specular-base", tint: { r: 1, g: 1, b: 1 }, scatterMode: "transmit" });
      internalT = faces.internalT;
      params.push({
        name: INTERIOR_FACE_PARAM,
        type: "bool",
        defaultValue: false,
        displayName: "Interior face",
        description:
          "Off for the exterior-facing face (Material ID 1) and edges (ID 3); on for the cavity/interior-facing face (Material ID 2).",
      });
    } else {
      // Uncoated glass gets MDL's real Fresnel split from the material IOR,
      // which beats any curve we could fit to it. Body color lives in the
      // volume, so the surface itself stays neutral.
      layers.push({
        kind: "specular-base",
        tint: { r: 1, g: 1, b: 1 },
        scatterMode: "reflect_transmit",
      });
      // Exposed as a parameter so the emitted signature matches the form the
      // scripted Iray+ binding path was validated against (a bare `()`
      // signature has never been through irpSetMaterialType).
      params.push({
        name: "ior",
        type: "float",
        defaultValue: GLASS_IOR,
        displayName: "Index of refraction",
        description: "Drives the real Fresnel split and refraction. 1.52 is architectural float glass.",
      });
    }

    const notes = [
      `Apply to lite ${i + 1} of ${input.lites.length}, modeled as a ${lite.thickness}mm thick solid.`,
      "Absorption is per meter of travel, so the solid's real thickness must match the value above.",
    ];
    if (isCoated && lite.coating) {
      notes.push(
        `Coating fitted for surface #${lite.coating.surface}. Assign this material to the solid's face Material IDs: ID 1 = exterior face (${INTERIOR_FACE_PARAM} off), ID 2 = cavity/interior face (${INTERIOR_FACE_PARAM} on), ID 3 = edges (off). The bundled bind_manifest.json and the glass2mdl Max apply script automate the assignment.`,
        "The volume carries the coating's absorption as well as the glass body's - the fitted faces only reflect and pass, so the divergence from the nominal body transmittance is intentional.",
      );
    }

    return {
      name: `${prefix}_${positions[i]}`,
      displayName: `${input.name} - ${positions[i]} lite`,
      description: `${lite.thickness}mm ${SUBSTRATE_LABELS[lite.substrate]}${
        lite.coating ? `, ${lite.coating.kind} coating` : ""
      }`,
      thinWalled: false,
      ior: GLASS_IOR,
      layers,
      volume: { absorptionCoefficient: volumeAbsorption(internalT, lite.thickness) },
      params,
      moduleFunctions: [],
      comments: provenanceComments(input, "volumetric", fit, notes),
    };
  });

  const names = uniquify(materials.map((m) => m.name));
  materials.forEach((m, i) => (m.name = names[i]));

  const textures: { fileName: string; bytes: Uint8Array }[] = [];

  // Roller wave ships as a Max-side bump map; the apply script wires it into
  // each lite material's geometry normal channel (not the frit decal below):
  // the ripple is a property of the heat-treated glass itself.
  if (input.rollerWave) {
    textures.push(rollerWaveTexture());
  }

  // Frit gets its own thin decal material rather than being folded into a lite.
  // Its exact depth in the assembly is visible - it shadows, and it catches
  // light bouncing between lites - and a decal also sidesteps the both-faces
  // limitation that constrains coatings.
  if (input.frit) {
    const lowered = lowerFrit(input.frit, prefix);
    const { lite, face } = locateSurface(input.frit.surface);
    const decal: MaterialIR = {
      name: `${prefix}_frit_decal`,
      displayName: `${input.name} - frit decal`,
      description: `${input.frit.pattern.kind} frit for surface #${input.frit.surface}`,
      thinWalled: true,
      ior: GLASS_IOR,
      layers: [
        { kind: "frit", color: input.frit.color, opacity: input.frit.opacity, weight: { kind: "uniform", coverage: 1 } },
      ],
      cutoutOpacity: lowered.weight,
      params: lowered.moduleFunctions.length
        ? [
            {
              name: "frit_pattern_scale",
              type: "float",
              defaultValue: 1,
              displayName: "Frit pattern scale",
              description:
                "Multiplies the pattern's physical size. Leave at 1.0 when the plane uses a 1 m x 1 m UVW map.",
            },
          ]
        : [],
      moduleFunctions: lowered.moduleFunctions,
      comments: provenanceComments(input, "volumetric", fit, [
        `Apply to a flat plane placed on surface #${input.frit.surface}: the ${
          face === "front" ? "exterior" : "interior"
        }-facing face of lite ${lite + 1}.`,
        "Offset the plane about 0.1mm off the glass face so the renderer does not have to break a tie between coincident surfaces.",
        "Frit pattern assumes 1 UV unit = 1 meter (a 1 m x 1 m UVW Map, or Real-World Map Size).",
      ]),
    };
    materials.push(decal);
    textures.push(...lowered.textures);

    warnings.push({
      code: "frit-decal-plane",
      message: `Frit exports as a separate decal material. Add a plane at surface #${input.frit.surface} and assign it; the README has the placement steps.`,
    });
  }

  return { materials, derived: buildDerived(input, fit), warnings, textures };
}
