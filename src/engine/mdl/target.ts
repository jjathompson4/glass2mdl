/**
 * The single place that decides what dialect of MDL we emit.
 *
 * Iray for 3ds Max (Lightworks Iray+ 3.1) runs the Iray 2025.0.3 SDK, which
 * supports MDL well past this version. We deliberately target a conservative
 * one and restrict ourselves to the core standard modules — no ::nvidia:: or
 * vMaterials dependencies, so a generated file resolves with nothing installed
 * beyond the plugin itself.
 *
 * If validation in a real Max install ever forces a change, it happens here,
 * and the golden-file tests immediately show every output it affects.
 */
export const MDL_VERSION = "1.6";

/** Standard modules the emitter is allowed to import. */
export const ALLOWED_MODULES = ["df", "base", "state", "math", "anno", "tex"] as const;
export type AllowedModule = (typeof ALLOWED_MODULES)[number];

export const TOOL_NAME = "glass2mdl";
export const TOOL_VERSION = "0.1.0";

/**
 * Texture-space convention for procedural frit patterns: one UV unit is one
 * metre, matching a 1 m x 1 m UVW Map (or Real-World Map Size) in 3ds Max.
 * Physical millimetres in the UI are converted against this.
 */
export const UV_UNITS_PER_METER = 1;
