import { maxSurface } from "../physics/assembly";
import { impliedLuminance } from "../physics/colorimetry";
import type { ColorSpec } from "../types/color";
import type { ValidationIssue } from "../types/issues";
import type { ExportMode, GlazingSystemInput } from "../types/system";

/**
 * Cross-field checks that the form's own field validation cannot make.
 *
 * Errors mean the input cannot describe real glass and export is blocked.
 * Warnings mean it can, but the result will approximate — those still export,
 * and travel into the generated README so they are not lost after download.
 */

const THICKNESS_MM = { min: 1, max: 25 };
const GAP_MM = { min: 3, max: 30 };
/** Percentage points of disagreement tolerated between L* and its measurement. */
const LIGHTNESS_TOLERANCE = 0.05;

export function validateSystem(input: GlazingSystemInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { lites, gaps, assembly, frit } = input;

  if (!input.name.trim()) {
    issues.push({
      severity: "error",
      code: "name-required",
      message: "Give the glazing a name; it becomes the material and file name.",
      field: "name",
    });
  }

  if (lites.length < 1 || lites.length > 3) {
    issues.push({
      severity: "error",
      code: "lite-count",
      message: "Supported constructions run from a single lite up to a triple IGU.",
      field: "lites",
    });
    return issues; // everything below assumes a sane lite count
  }

  if (gaps.length !== lites.length - 1) {
    issues.push({
      severity: "error",
      code: "gap-count",
      message: `A ${lites.length}-lite construction needs ${lites.length - 1} gap${
        lites.length === 2 ? "" : "s"
      }.`,
      field: "gaps",
    });
  }

  lites.forEach((lite, i) => {
    if (!(lite.thickness > 0)) {
      issues.push({
        severity: "error",
        code: "thickness-required",
        message: `Lite ${i + 1} needs a thickness.`,
        field: `lites.${i}.thickness`,
      });
    } else if (lite.thickness < THICKNESS_MM.min || lite.thickness > THICKNESS_MM.max) {
      issues.push({
        severity: "warning",
        code: "thickness-unusual",
        message: `Lite ${i + 1} at ${lite.thickness}mm is outside the usual ${THICKNESS_MM.min}–${THICKNESS_MM.max}mm range. Check the units.`,
        field: `lites.${i}.thickness`,
      });
    }
  });

  gaps.forEach((gap, i) => {
    if (!(gap.width > 0)) {
      issues.push({
        severity: "error",
        code: "gap-required",
        message: `Gap ${i + 1} needs a width.`,
        field: `gaps.${i}.width`,
      });
    } else if (gap.width < GAP_MM.min || gap.width > GAP_MM.max) {
      issues.push({
        severity: "warning",
        code: "gap-unusual",
        message: `Gap ${i + 1} at ${gap.width}mm is outside the usual ${GAP_MM.min}–${GAP_MM.max}mm range.`,
        field: `gaps.${i}.width`,
      });
    }
  });

  const highest = maxSurface(lites.length);
  const coatings = lites.filter((l) => l.coating);

  if (coatings.length > 1) {
    issues.push({
      severity: "error",
      code: "multiple-coatings",
      message:
        "Only one coating can be fitted at a time. A second coating has no measurement left to fit against on a cutsheet that reports one set of assembly values.",
      field: "lites",
    });
  }

  lites.forEach((lite, i) => {
    if (!lite.coating) return;
    const surface = lite.coating.surface;
    if (surface > highest) {
      issues.push({
        severity: "error",
        code: "coating-surface-range",
        message: `Surface #${surface} does not exist on a ${lites.length}-lite construction (surfaces #1–#${highest}).`,
        field: `lites.${i}.coating.surface`,
      });
      return;
    }
    const owner = Math.floor((surface - 1) / 2);
    if (owner !== i) {
      issues.push({
        severity: "error",
        code: "coating-surface-mismatch",
        message: `Surface #${surface} belongs to lite ${owner + 1}, but the coating is set on lite ${i + 1}.`,
        field: `lites.${i}.coating.surface`,
      });
    }
  });

  if (frit) {
    if (frit.surface > highest) {
      issues.push({
        severity: "error",
        code: "frit-surface-range",
        message: `Surface #${frit.surface} does not exist on a ${lites.length}-lite construction (surfaces #1–#${highest}).`,
        field: "frit.surface",
      });
    }
    if (frit.pattern.kind === "dots" && frit.pattern.dotDiameter > frit.pattern.spacing) {
      issues.push({
        severity: "warning",
        code: "frit-dots-overlap",
        message: "Dots are larger than their spacing, so the frit reads as solid coverage.",
        field: "frit.pattern",
      });
    }
    if (frit.pattern.kind === "lines" && frit.pattern.lineWidth > frit.pattern.spacing) {
      issues.push({
        severity: "warning",
        code: "frit-lines-overlap",
        message: "Lines are wider than their spacing, so the frit reads as solid coverage.",
        field: "frit.pattern",
      });
    }
  }

  const fields: Array<["tvis" | "rvisExt" | "rvisInt", string, string]> = [
    ["tvis", "Visible light transmittance", "assembly.tvis"],
    ["rvisExt", "Exterior visible reflectance", "assembly.rvisExt"],
    ["rvisInt", "Interior visible reflectance", "assembly.rvisInt"],
  ];

  for (const [key, label, field] of fields) {
    const value = assembly[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      issues.push({
        severity: "error",
        code: "optics-range",
        message: `${label} must be between 0% and 100%.`,
        field,
      });
    }
  }

  // Transmitted plus reflected light cannot exceed what arrived.
  const outbound = assembly.tvis + assembly.rvisExt;
  if (outbound > 1.0001) {
    issues.push({
      severity: "error",
      code: "energy-exceeded",
      message: `Transmittance (${(assembly.tvis * 100).toFixed(0)}%) plus exterior reflectance (${(
        assembly.rvisExt * 100
      ).toFixed(0)}%) exceeds 100%. Check the cutsheet columns.`,
      field: "assembly.tvis",
    });
  } else if (outbound > 0.97) {
    issues.push({
      severity: "warning",
      code: "energy-tight",
      message:
        "Transmittance plus reflectance leaves almost no absorption, which real glass always has. The fit will approximate.",
      field: "assembly.tvis",
    });
  }

  // L* carries lightness, so a measured color and its performance value state
  // the same thing twice. Disagreement means one of them was mistyped.
  const colorChecks: Array<[ColorSpec | undefined, number, string, string]> = [
    [assembly.transmittedColor, assembly.tvis, "Transmitted color", "assembly.transmittedColor"],
    [assembly.reflectedColorExt, assembly.rvisExt, "Exterior reflected color", "assembly.reflectedColorExt"],
    [assembly.reflectedColorInt, assembly.rvisInt, "Interior reflected color", "assembly.reflectedColorInt"],
  ];

  for (const [spec, measured, label, field] of colorChecks) {
    const implied = impliedLuminance(spec);
    if (implied === undefined) continue;

    if (Math.abs(implied - measured) > LIGHTNESS_TOLERANCE) {
      issues.push({
        severity: "warning",
        code: "lightness-mismatch",
        message: `${label} has L* ${(spec as { L: number }).L.toFixed(
          1,
        )}, which is ${(implied * 100).toFixed(0)}%, but ${(measured * 100).toFixed(
          0,
        )}% was entered alongside it. The percentage sets the level and the color sets the hue, so check whether the two came from the same product row.`,
        field,
      });
    }
  }

  return issues;
}

/**
 * Coated volumetric exports use the render-validated Material-ID assembly
 * (docs/iray-findings.md §5/§9.6): Iray ignores `backface` on solids but does
 * honor per-face Material IDs, so the coated lite's material carries an
 * `interior_face` parameter and is assigned to both face IDs with it flipped.
 * That needs one-time scene setup in 3ds Max — surfaced here as a warning so
 * nobody exports expecting drag-and-drop — but no longer blocks the export.
 */
export function validateForMode(
  input: GlazingSystemInput,
  mode: ExportMode,
): ValidationIssue[] {
  const issues = validateSystem(input);
  if (mode !== "volumetric") return issues;

  const coatedIndex = input.lites.findIndex((l) => l.coating);
  if (coatedIndex < 0) return issues;

  return [
    ...issues,
    {
      severity: "warning",
      code: "volumetric-coating-setup",
      message:
        "The coated lite exports as a per-face Material-ID assembly: in 3ds Max, assign its material to face ID 1 (exterior), ID 2 (interior; turn interior_face on in that slot), and ID 3 (edges) via a Multi-Sub-Object. The README and bundled bind manifest cover the setup; the glass2mdl Max apply script automates it.",
      field: `lites.${coatedIndex}.coating`,
    },
  ];
}

export const hasErrors = (issues: ValidationIssue[]): boolean =>
  issues.some((i) => i.severity === "error");
