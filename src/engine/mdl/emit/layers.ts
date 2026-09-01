import { SCHLICK_EXPONENT } from "../../physics/constants";
import type { FritWeightSource, LayerIR } from "../../types/ir";
import type { RGB } from "../../types/optics";
import { call, colorLiteral, num, renderInline, type ImportTracker, type MdlExpr } from "./writer";

/**
 * Lowering the layer stack into MDL distribution functions.
 *
 * The stack is ordered outermost-first, and MDL layering nests the other way
 * around — each layer takes the one beneath it as its `base` — so it is built
 * from the innermost layer outward. Every mapping from glazing concept to
 * `df::` call lives here and nowhere else.
 */

const WHITE = { r: 1, g: 1, b: 1 };

/**
 * The bool parameter selecting a solid's face-specific values. One material
 * serves both Material IDs of a coated lite: the exterior-face ID leaves it
 * off, the interior/cavity-face ID turns it on.
 */
export const INTERIOR_FACE_PARAM = "interior_face";

/** Ceramic frit: an opaque diffuse reflector that lets a little light diffuse through. */
function fritBsdf(imports: ImportTracker, color: LayerIR & { kind: "frit" }): MdlExpr {
  const reflect = call(imports.ref("df", "diffuse_reflection_bsdf"), [
    ["tint", colorLiteral(color.color)],
  ]);

  if (color.opacity >= 0.999) return reflect;

  const transmit = call(imports.ref("df", "diffuse_transmission_bsdf"), [
    ["tint", colorLiteral(color.color)],
  ]);

  return call(imports.ref("df", "normalized_mix"), [
    [
      "components",
      call(`${imports.ref("df", "bsdf_component")}[]`, [
        [
          "",
          call(imports.ref("df", "bsdf_component"), [
            ["weight", num(color.opacity)],
            ["component", reflect],
          ]),
        ],
        [
          "",
          call(imports.ref("df", "bsdf_component"), [
            ["weight", num(1 - color.opacity)],
            ["component", transmit],
          ]),
        ],
      ]),
    ],
  ]);
}

function scatterMode(imports: ImportTracker, mode: "reflect" | "transmit" | "reflect_transmit") {
  return imports.ref("df", `scatter_${mode}`);
}

function diffuseBsdf(imports: ImportTracker, color: RGB): MdlExpr {
  return call(imports.ref("df", "diffuse_reflection_bsdf"), [["tint", colorLiteral(color)]]);
}

/** A metallic finish: glossy reflection in the metal's own colour, nothing transmitted. */
function metalBsdf(imports: ImportTracker, layer: LayerIR & { kind: "metal" }): MdlExpr {
  return call(imports.ref("df", "simple_glossy_bsdf"), [
    ["roughness_u", num(layer.roughness)],
    ["tint", colorLiteral(layer.color)],
    ["mode", scatterMode(imports, "reflect")],
  ]);
}

/** The innermost layer, which terminates the nesting. */
function baseBsdf(imports: ImportTracker, layer: LayerIR): MdlExpr {
  switch (layer.kind) {
    case "specular-base":
      return call(imports.ref("df", "specular_bsdf"), [
        ["tint", colorLiteral(layer.tint)],
        ["mode", scatterMode(imports, layer.scatterMode)],
      ]);
    case "diffuse":
      return diffuseBsdf(imports, layer.color);
    case "metal":
      return metalBsdf(imports, layer);
    case "frit":
      return fritBsdf(imports, layer);
    case "fresnel-coating":
      // A coating with nothing under it still needs something to layer onto.
      return call(imports.ref("df", "specular_bsdf"), [
        ["tint", colorLiteral(layer.reflectColor)],
        ["mode", scatterMode(imports, "reflect")],
      ]);
  }
}

export function weightExpression(weight: FritWeightSource, scaleParam: string): MdlExpr {
  return weight.kind === "uniform" ? num(weight.coverage) : `${weight.functionName}(${scaleParam})`;
}

/** Wrap `base` in one more layer. */
function wrap(imports: ImportTracker, layer: LayerIR, base: MdlExpr, scaleParam: string): MdlExpr {
  switch (layer.kind) {
    case "fresnel-coating": {
      // Schlick curve: the fitted normal-incidence reflectance rising to full
      // mirror reflection at grazing, which is what makes coated glass read
      // correctly as the viewing angle opens up. A per-face variant selects
      // its values through the interior_face parameter, so one material can
      // sit on both Material IDs of a solid.
      const variant = layer.interiorVariant;
      const reflectivity = variant
        ? `${INTERIOR_FACE_PARAM} ? ${num(variant.normalReflectivity)} : ${num(layer.normalReflectivity)}`
        : num(layer.normalReflectivity);
      const tint = variant
        ? `${INTERIOR_FACE_PARAM} ? ${colorLiteral(variant.reflectColor)} : ${colorLiteral(layer.reflectColor)}`
        : colorLiteral(layer.reflectColor);
      return call(imports.ref("df", "custom_curve_layer"), [
        ["normal_reflectivity", reflectivity],
        ["grazing_reflectivity", num(layer.grazingReflectivity)],
        ["exponent", num(SCHLICK_EXPONENT)],
        [
          "layer",
          call(imports.ref("df", "specular_bsdf"), [
            ["tint", tint],
            ["mode", scatterMode(imports, "reflect")],
          ]),
        ],
        ["base", base],
      ]);
    }

    case "frit":
      return call(imports.ref("df", "weighted_layer"), [
        ["weight", weightExpression(layer.weight, scaleParam)],
        ["layer", fritBsdf(imports, layer)],
        ["base", base],
      ]);

    case "diffuse":
      if (layer.interiorFaceOnly) {
        // A flood coat on one face of a solid: the Material ID that turns
        // interior_face on gets the opaque paint in place of the glass stack;
        // every other ID keeps the glass. A bsdf conditional on a uniform
        // parameter, rather than a weighted mix, because the paint has to
        // REPLACE the interface — the exterior face must not see it at all.
        return `${INTERIOR_FACE_PARAM} ? ${renderInline(diffuseBsdf(imports, layer.color))} : ${renderInline(base)}`;
      }
      return call(imports.ref("df", "weighted_layer"), [
        ["weight", num(1)],
        ["layer", diffuseBsdf(imports, layer.color)],
        ["base", base],
      ]);

    case "metal":
      return call(imports.ref("df", "weighted_layer"), [
        ["weight", num(1)],
        ["layer", metalBsdf(imports, layer)],
        ["base", base],
      ]);

    case "specular-base":
      // Glass beneath glass is not a stack we generate; keep the outer one.
      return call(imports.ref("df", "weighted_layer"), [
        ["weight", num(1)],
        [
          "layer",
          call(imports.ref("df", "specular_bsdf"), [
            ["tint", colorLiteral(layer.tint ?? WHITE)],
            ["mode", scatterMode(imports, layer.scatterMode)],
          ]),
        ],
        ["base", base],
      ]);
  }
}

/** Build the full surface scattering expression from an outermost-first stack. */
export function buildScattering(
  imports: ImportTracker,
  layers: LayerIR[],
  scaleParam: string,
): MdlExpr {
  if (layers.length === 0) return call(imports.ref("df", "diffuse_reflection_bsdf"));

  let expr = baseBsdf(imports, layers[layers.length - 1]);
  for (let i = layers.length - 2; i >= 0; i--) {
    expr = wrap(imports, layers[i], expr, scaleParam);
  }
  return expr;
}
