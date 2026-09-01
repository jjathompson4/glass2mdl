import type { RGB } from "./optics";

/**
 * Semantic intermediate representation for generated materials.
 *
 * The IR describes *glazing intent*, not MDL syntax. Solvers produce it and
 * never emit strings; the emitter consumes it and never computes physics.
 * Future features (laminates, acid-etch, spandrel) add node kinds here plus one
 * emitter case each, rather than forking template variants.
 */

/** How a frit layer's coverage varies across the surface. */
export type FritWeightSource =
  | { kind: "uniform"; coverage: number }
  | { kind: "function"; functionName: string };

export type LayerIR =
  /** The glass itself. Innermost layer of the surface stack. */
  | {
      kind: "specular-base";
      tint: RGB;
      /** reflect_transmit for solids; transmit for thin-walled planar sheets. */
      scatterMode: "reflect" | "transmit" | "reflect_transmit";
    }
  /** A coating, as a Schlick-curve layer over whatever is beneath it. */
  | {
      kind: "fresnel-coating";
      normalReflectivity: number;
      grazingReflectivity: number;
      reflectColor: RGB;
      /**
       * Per-face values for solids, selected by the material's `interior_face`
       * bool parameter (Iray honors Material IDs on solids, not `backface`, so
       * the same material is assigned to both face IDs with the parameter
       * flipped). When present, the material must declare that parameter.
       */
      interiorVariant?: { normalReflectivity: number; reflectColor: RGB };
    }
  /** Ceramic frit fused to the surface: diffuse reflect + diffuse transmit. */
  | {
      kind: "frit";
      color: RGB;
      /** 1 = fully opaque enamel; lower lets more light diffuse through. */
      opacity: number;
      weight: FritWeightSource;
    }
  /** Diffuse-only opaque surface: a flood coat, or a painted back pan. */
  | {
      kind: "diffuse";
      color: RGB;
      /**
       * Solids only: the layer replaces the whole stack on the face whose
       * Material ID turns `interior_face` on, and is absent on the others.
       * This is how a flood coat lands on surface #4 alone. The material
       * must declare the `interior_face` parameter.
       */
      interiorFaceOnly?: true;
    }
  /** Glossy metal: a metallic-finish back pan. Roughness 0 = mirror. */
  | { kind: "metal"; color: RGB; roughness: number };

/** Module-level MDL functions a material references. */
export type ModuleFunctionIR =
  | {
      kind: "dot-pattern";
      name: string;
      /** Physical dimensions in millimeters; the emitter converts to UV. */
      dotDiameterMm: number;
      spacingMm: number;
    }
  | {
      kind: "line-pattern";
      name: string;
      lineWidthMm: number;
      spacingMm: number;
      orientation: "horizontal" | "vertical";
    }
  | { kind: "texture-mask"; name: string; textureFileName: string }
  /** Validation-kit probe: a 0..1 value derived from state::object_id(). */
  | { kind: "object-id-probe"; name: string };

export interface MaterialParamIR {
  name: string;
  type: "float" | "color" | "bool";
  defaultValue: number | RGB | boolean;
  displayName: string;
  description?: string;
}

export interface MaterialIR {
  /** Valid MDL identifier. */
  name: string;
  /** Human-facing name shown in the 3ds Max material browser. */
  displayName: string;
  description: string;
  thinWalled: boolean;
  /** Index of refraction; meaningful for solids. */
  ior: number;
  /** Surface stack, ordered outermost-first. */
  layers: LayerIR[];
  /**
   * Interior-side appearance. Only valid on thin-walled materials — Iray
   * ignores `backface` on solids (render-confirmed, kit test 02). Solids get
   * per-face behavior through Material IDs plus the `fresnel-coating` layer's
   * `interiorVariant` instead.
   */
  backface?: { layers: LayerIR[] };
  /** Beer-Lambert absorption in 1/meter. Solids only. */
  volume?: { absorptionCoefficient: RGB };
  /** Pattern mask driving cutout_opacity, for frit decal materials. */
  cutoutOpacity?: FritWeightSource;
  params: MaterialParamIR[];
  moduleFunctions: ModuleFunctionIR[];
  /** Provenance and assumption notes emitted above the material. */
  comments: string[];
}
