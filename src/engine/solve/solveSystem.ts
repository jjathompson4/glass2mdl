import { emitModule, type EmittedModule } from "../mdl/emit/module";
import { contentRevision, toIdentifier } from "../mdl/naming";
import { TOOL_NAME, TOOL_VERSION, MDL_VERSION } from "../mdl/target";
import type { MaterialIR } from "../types/ir";
import type { DerivedOptics } from "../types/optics";
import type { SolverWarning } from "../types/issues";
import type { ExportMode, GlazingSystemInput } from "../types/system";
import { solvePlanar } from "./planar";
import { solveVolumetric } from "./volumetric";

export interface SolveResult {
  materials: MaterialIR[];
  derived: DerivedOptics;
  warnings: SolverWarning[];
  textures: { fileName: string; bytes: Uint8Array }[];
  module: EmittedModule;
}

/**
 * Solve a glazing system and emit its MDL module.
 *
 * The same solve feeds both the on-screen preview and the downloaded file, so
 * what a user sees and what they get can never be computed from different
 * numbers.
 */
export function solveSystem(input: GlazingSystemInput, mode: ExportMode): SolveResult {
  const solved = mode === "planar" ? solvePlanar(input) : solveVolumetric(input);
  const baseName = `${TOOL_NAME}_${toIdentifier(input.name)}_${mode}`;

  const emitted = emitModule(baseName, solved.materials, [
    `${TOOL_NAME} ${TOOL_VERSION} — MDL ${MDL_VERSION}`,
    `${input.name} — ${mode} export`,
    "",
    "Install: copy this folder into a directory listed as an MDL search path in",
    "Iray for 3ds Max, then pick the material from the Iray+ material browser.",
  ]);

  // The filename carries a content revision because 3ds Max caches a loaded
  // module for the whole session: an edited file under the same name is
  // silently ignored, so a changed export must arrive under a new one. The
  // module name is not embedded in the source, which is what makes hashing
  // the emitted text stable.
  const fileName = `${baseName}_${contentRevision(emitted.source, solved.textures)}.mdl`;

  return { ...solved, module: { ...emitted, fileName } };
}
