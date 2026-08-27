/**
 * glass2mdl engine — the public surface the app is allowed to import.
 *
 * Everything here is pure TypeScript with no browser or framework dependency,
 * so the same code can run in a test, in the browser, or in a future render
 * service. Texture data crosses the boundary as bytes, never as a File.
 */

export type {
  AssemblyOptics,
  DerivedOptics,
  Fraction,
  LiteDerived,
  Millimeters,
  Optics,
  RGB,
} from "./types/optics";
export { fraction, mm } from "./types/optics";

export type {
  CoatingInput,
  CoatingKind,
  ExportMode,
  FritInput,
  RollerWaveInput,
  FritPattern,
  GapInput,
  GlazingSystemInput,
  LiteInput,
  SubstrateTint,
  SurfaceNumber,
} from "./types/system";

export type { MaterialIR } from "./types/ir";
export type { SolverWarning, ValidationIssue } from "./types/issues";

export type { ColorSpec, StandardObserver } from "./types/color";
export { AUTO_COLOR, isMeasured } from "./types/color";
export type { CoatingOverrides } from "./types/system";

export { validateSystem, validateForMode, hasErrors } from "./validate/validate";
export {
  describeColorSpec,
  impliedLuminance,
  labToXYZ,
  lightnessToLuminance,
  luminanceToLightness,
  resolveColorSpec,
  xyYToXYZ,
  xyzToLab,
  xyzToLinearRGB,
  linearRGBToXYZ,
} from "./physics/colorimetry";
export {
  locateSurface,
  maxSurface,
  fitAssembly,
  fitResidual,
  naturalAssemblyOptics,
  nominalAssemblyHue,
} from "./physics/assembly";
export { SUBSTRATE_LABELS, SUBSTRATE_INTERNAL_T_6MM, GLASS_IOR, DEFAULT_FRIT_OPACITY } from "./physics/constants";
export { luminance, hexToLinearRGB, linearRGBToHex, gray, clampRGB } from "./physics/color";
export { patternCoverage } from "./solve/frit";
export { MDL_VERSION, TOOL_NAME, TOOL_VERSION } from "./mdl/target";
export { litePositionNames, toIdentifier, sanitizeTextureFileName } from "./mdl/naming";

export { solveSystem, type SolveResult } from "./solve/solveSystem";
export { buildExport, type ExportBundle, type ExportFile } from "./package/exportBundle";
export type { RenderRequest, RenderJobAccepted, RenderJobStatus, RenderError } from "./renderApi/contract";
export { RENDER_API_VERSION } from "./renderApi/contract";
