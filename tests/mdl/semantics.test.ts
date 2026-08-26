import { describe, expect, it } from "vitest";
import { solvePlanar } from "@/engine/solve/planar";
import { solveVolumetric } from "@/engine/solve/volumetric";
import { fitAssembly, liteAggregateOptics } from "@/engine/physics/assembly";
import { luminance, scaleRGB } from "@/engine/physics/color";
import { AIR_GLASS_R0 } from "@/engine/physics/constants";
import { bareInterface, slabOptics } from "@/engine/physics/slab";
import { fraction, mm, type RGB } from "@/engine/types/optics";
import type { LayerIR } from "@/engine/types/ir";
import type { GlazingSystemInput } from "@/engine/types/system";

/**
 * These tests stand in for an MDL compiler we do not have locally.
 *
 * They re-implement how MDL evaluates our layer stack at normal incidence and
 * check that the material we emit actually returns the numbers the user typed
 * off the cutsheet. Both of MDL's layering functions mix rather than add —
 * `w*layer + (1-w)*base` — which is exactly the subtlety worth pinning down.
 */

interface Evaluated {
  reflect: RGB;
  transmit: RGB;
}

function evaluateAtNormalIncidence(layers: LayerIR[]): Evaluated {
  const innermost = layers[layers.length - 1];
  let result: Evaluated =
    innermost.kind === "specular-base"
      ? innermost.scatterMode === "transmit"
        ? { reflect: { r: 0, g: 0, b: 0 }, transmit: innermost.tint }
        : {
            // A solid's own interface splits by Fresnel using the material IOR.
            reflect: scaleRGB(innermost.tint, AIR_GLASS_R0),
            transmit: scaleRGB(innermost.tint, 1 - AIR_GLASS_R0),
          }
      : { reflect: { r: 0, g: 0, b: 0 }, transmit: { r: 0, g: 0, b: 0 } };

  for (let i = layers.length - 2; i >= 0; i--) {
    const layer = layers[i];
    if (layer.kind !== "fresnel-coating") continue;
    const w = layer.normalReflectivity; // curve value at normal incidence
    result = {
      reflect: {
        r: w * layer.reflectColor.r + (1 - w) * result.reflect.r,
        g: w * layer.reflectColor.g + (1 - w) * result.reflect.g,
        b: w * layer.reflectColor.b + (1 - w) * result.reflect.b,
      },
      transmit: scaleRGB(result.transmit, 1 - w),
    };
  }

  return result;
}

const solarban60: GlazingSystemInput = {
  name: "Solarban 60 clear",
  lites: [
    {
      thickness: mm(6),
      substrate: "clear",
      coating: { kind: "low-e", surface: 2, reflectedColor: { r: 0.8, g: 0.85, b: 0.9 } },
    },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: { tvis: fraction(0.7), rvisExt: fraction(0.11), rvisInt: fraction(0.12) },
};

const monolithicBronze: GlazingSystemInput = {
  name: "Bronze 6mm",
  lites: [{ thickness: mm(6), substrate: "bronze" }],
  gaps: [],
  assembly: { tvis: fraction(0.52), rvisExt: fraction(0.06), rvisInt: fraction(0.06) },
};

describe("planar material evaluates to the cutsheet numbers", () => {
  it("reproduces exterior transmittance and reflectance", () => {
    const material = solvePlanar(solarban60).materials[0];
    const front = evaluateAtNormalIncidence(material.layers);

    expect(luminance(front.transmit)).toBeCloseTo(solarban60.assembly.tvis, 3);
    expect(luminance(front.reflect)).toBeCloseTo(solarban60.assembly.rvisExt, 3);
  });

  it("gives the interior side its own reflectance via backface", () => {
    const material = solvePlanar(solarban60).materials[0];
    expect(material.backface).toBeDefined();
    const back = evaluateAtNormalIncidence(material.backface!.layers);

    expect(luminance(back.reflect)).toBeCloseTo(solarban60.assembly.rvisInt, 3);
    expect(luminance(back.transmit)).toBeCloseTo(solarban60.assembly.tvis, 3);
    expect(luminance(back.reflect)).not.toBeCloseTo(luminance(front(material)), 4);
  });

  it("holds for an uncoated tinted monolithic lite", () => {
    const material = solvePlanar(monolithicBronze).materials[0];
    const evaluated = evaluateAtNormalIncidence(material.layers);

    expect(luminance(evaluated.transmit)).toBeCloseTo(monolithicBronze.assembly.tvis, 3);
    expect(evaluated.transmit.r).toBeGreaterThan(evaluated.transmit.b); // still bronze
  });

  it("never emits a tint above 1.0, which would create light", () => {
    for (const input of [solarban60, monolithicBronze]) {
      for (const layer of solvePlanar(input).materials[0].layers) {
        if (layer.kind !== "specular-base") continue;
        for (const v of [layer.tint.r, layer.tint.g, layer.tint.b]) {
          expect(v).toBeLessThanOrEqual(1);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

function front(material: { layers: LayerIR[] }): RGB {
  return evaluateAtNormalIncidence(material.layers).reflect;
}

describe("volumetric materials", () => {
  it("gives the coated lite per-face values selected by interior_face", () => {
    const coated = solveVolumetric(solarban60).materials[0];
    const layer = coated.layers[0];

    expect(layer.kind).toBe("fresnel-coating");
    if (layer.kind !== "fresnel-coating") return;
    expect(layer.interiorVariant).toBeDefined();
    // Low-e on surface #2: the cavity-facing side of this lite reflects less
    // than its exterior side — the asymmetry Material IDs exist to carry.
    expect(layer.interiorVariant!.normalReflectivity).toBeLessThan(layer.normalReflectivity);

    const param = coated.params.find((p) => p.name === "interior_face");
    expect(param?.type).toBe("bool");
    expect(param?.defaultValue).toBe(false);
  });

  it("lets the coated lite's cavity face reflect less than a bare lite face", () => {
    // Solarban 60 returns 11% where uncoated double glazing returns about 14%,
    // so the structure must be able to reduce reflection, not only add to it.
    // A bare lite face aggregates to ~8%; the fitted cavity face sits below it,
    // which no layer stacked over reflecting glass could reach.
    const fit = fitAssembly(solarban60);
    const bare = slabOptics(fit.internalT[0].g, bareInterface(), bareInterface());
    const coated = solveVolumetric(solarban60).materials[0];
    const layer = coated.layers[0];
    if (layer.kind !== "fresnel-coating") throw new Error("expected coating layer");

    expect(layer.interiorVariant!.normalReflectivity).toBeLessThan(bare.rBack);
  });

  it("emits face values whose rendered composition reproduces the fitted lite", () => {
    // The renderer sums the bounces between the two emitted faces itself, so
    // the baked numbers must compose back into the lite aggregate the assembly
    // fit assumed — fitLiteFaces' exactness guarantee, checked here from the
    // emitted IR alone. Face transmittance is the scalar complement of the
    // Schlick reflectivity (custom_curve_layer semantics), per channel.
    const fit = fitAssembly(solarban60);
    const aggregate = liteAggregateOptics(fit, 0);
    const coated = solveVolumetric(solarban60).materials[0];
    const layer = coated.layers[0];
    if (layer.kind !== "fresnel-coating" || !layer.interiorVariant) {
      throw new Error("expected per-face coating layer");
    }

    const tauF = 1 - layer.normalReflectivity;
    const tauB = 1 - layer.interiorVariant.normalReflectivity;
    for (const c of ["r", "g", "b"] as const) {
      const rf = layer.normalReflectivity * layer.reflectColor[c];
      const rb = layer.interiorVariant.normalReflectivity * layer.interiorVariant.reflectColor[c];
      const t = Math.exp(-coated.volume!.absorptionCoefficient[c] * 0.006);
      const rendered = slabOptics(
        t,
        { rExt: rf, rInt: rf, tau: tauF },
        { rExt: rb, rInt: rb, tau: tauB },
      );

      expect(rendered.t).toBeCloseTo(aggregate.t[c], 3);
      expect(rendered.rFront).toBeCloseTo(aggregate.rFront[c], 3);
      expect(rendered.rBack).toBeCloseTo(aggregate.rBack[c], 3);
    }
  });

  it("keeps refraction on a coated lite by transmitting through the material IOR", () => {
    const coated = solveVolumetric(solarban60).materials[0];
    const base = coated.layers[coated.layers.length - 1];

    expect(base.kind).toBe("specular-base");
    expect(base.kind === "specular-base" && base.scatterMode).toBe("transmit");
    expect(coated.ior).toBeCloseTo(1.52, 6);
  });

  it("gives an uncoated lite MDL's own Fresnel split", () => {
    const uncoated = solveVolumetric(solarban60).materials[1];
    const base = uncoated.layers[uncoated.layers.length - 1];

    expect(uncoated.layers).toHaveLength(1); // nothing layered over the glass
    expect(base.kind === "specular-base" && base.scatterMode).toBe("reflect_transmit");
  });

  it("emits one material per lite, each with volume absorption", () => {
    const solved = solveVolumetric(solarban60);
    expect(solved.materials).toHaveLength(2);
    for (const material of solved.materials) {
      expect(material.thinWalled).toBe(false);
      expect(material.volume).toBeDefined();
      expect(material.ior).toBeCloseTo(1.52, 6);
    }
  });

  it("derives absorption consistent with the fitted body transmittance", () => {
    const solved = solveVolumetric(monolithicBronze);
    const sigma = solved.materials[0].volume!.absorptionCoefficient;
    const t = solved.derived.lites[0].internalTransmittance;

    // Beer-Lambert over the lite's own 6mm must return the fitted transmittance.
    for (const c of ["r", "g", "b"] as const) {
      expect(Math.exp(-sigma[c] * 0.006)).toBeCloseTo(t[c], 6);
    }
    expect(sigma.b).toBeGreaterThan(sigma.r); // bronze eats blue
  });

  it("records the Material-ID assignment in the generated file", () => {
    // The generated file has to be enough on its own to assign correctly: the
    // coated lite's comment names the per-face ID convention and the
    // interior_face parameter that selects between the faces.
    const coated = solveVolumetric(solarban60).materials[0];
    const comments = coated.comments.join(" ");

    expect(comments).toContain("surface #2");
    expect(comments).toContain("Material ID");
    expect(comments).toContain("interior_face");
  });
});
