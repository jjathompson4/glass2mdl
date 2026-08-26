/** Dotted path into GlazingSystemInput, e.g. "lites.0.thickness". */
export type FieldPath = string;

export interface ValidationIssue {
  severity: "error" | "warning";
  /** Stable machine code; the UI maps it to placement and styling. */
  code: string;
  message: string;
  field?: FieldPath;
}

/**
 * Emitted by the solver rather than the validator: these describe the quality
 * of the fit or an approximation baked into the output, not bad input. They
 * surface in the UI and are written into the generated README.
 */
export interface SolverWarning {
  code: string;
  message: string;
}
