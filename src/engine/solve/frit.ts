import type { FritWeightSource, ModuleFunctionIR } from "../types/ir";
import type { FritInput, FritPattern } from "../types/system";

/**
 * Frit lowering.
 *
 * A pattern becomes two things: a coverage weight the material layers against,
 * and (for procedural or textured patterns) a module-level MDL function the
 * weight refers to. Analytic coverage is also computed so the UI can show what
 * fraction of the aperture the chosen geometry actually blocks.
 */

export interface FritLowering {
  weight: FritWeightSource;
  moduleFunctions: ModuleFunctionIR[];
  /** Fraction of the surface covered by frit, 0–1. */
  coverage: number;
  /** Texture files that must ship alongside the .mdl. */
  textures: { fileName: string; bytes: Uint8Array }[];
}

/**
 * Analytic coverage of the procedural patterns.
 *
 * Dots sit on a square grid, so one cell holds one circle: pi*r^2 / spacing^2.
 * Lines are one stripe per cell: width / spacing. Both saturate at full
 * coverage when the feature outgrows its spacing.
 */
export function patternCoverage(pattern: FritPattern): number {
  switch (pattern.kind) {
    case "dots": {
      if (pattern.spacing <= 0) return 0;
      const area = (Math.PI * (pattern.dotDiameter / 2) ** 2) / pattern.spacing ** 2;
      return Math.min(1, area);
    }
    case "lines":
      return pattern.spacing <= 0 ? 0 : Math.min(1, pattern.lineWidth / pattern.spacing);
    case "uniform":
      return pattern.coverage;
    case "texture":
      // A mask's true coverage is only knowable by reading its pixels, which the
      // app does at upload time; assume full and let the mask do the work.
      return 1;
  }
}

export function lowerFrit(frit: FritInput, functionPrefix: string): FritLowering {
  const { pattern } = frit;
  const coverage = patternCoverage(pattern);

  switch (pattern.kind) {
    case "uniform":
      return { weight: { kind: "uniform", coverage }, moduleFunctions: [], coverage, textures: [] };

    case "dots": {
      const name = `${functionPrefix}_dot_coverage`;
      return {
        weight: { kind: "function", functionName: name },
        moduleFunctions: [
          {
            kind: "dot-pattern",
            name,
            dotDiameterMm: pattern.dotDiameter,
            spacingMm: pattern.spacing,
          },
        ],
        coverage,
        textures: [],
      };
    }

    case "lines": {
      const name = `${functionPrefix}_line_coverage`;
      return {
        weight: { kind: "function", functionName: name },
        moduleFunctions: [
          {
            kind: "line-pattern",
            name,
            lineWidthMm: pattern.lineWidth,
            spacingMm: pattern.spacing,
            orientation: pattern.orientation,
          },
        ],
        coverage,
        textures: [],
      };
    }

    case "texture": {
      const name = `${functionPrefix}_mask_coverage`;
      return {
        weight: { kind: "function", functionName: name },
        moduleFunctions: [
          { kind: "texture-mask", name, textureFileName: pattern.fileName },
        ],
        coverage,
        textures: [{ fileName: pattern.fileName, bytes: pattern.bytes }],
      };
    }
  }
}
