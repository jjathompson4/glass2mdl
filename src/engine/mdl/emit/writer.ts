import type { RGB } from "../../types/optics";
import type { AllowedModule } from "../target";

/**
 * MDL expression building and text output.
 *
 * Expressions are built as a small tree rather than concatenated strings so
 * nesting stays legible in the generated file, and so imports can be recorded
 * as a side effect of using a module rather than remembered separately.
 */

export interface MdlCall {
  call: string;
  args: Array<[string, MdlExpr]>;
}

export type MdlExpr = string | MdlCall;

export function call(name: string, args: Array<[string, MdlExpr]> = []): MdlCall {
  return { call: name, args };
}

/** Format a number as a valid MDL float literal — always with a decimal point. */
export function num(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  const digits = Math.abs(value) >= 1000 ? 3 : 6;
  const text = value.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ".0");
  return text.includes(".") ? text : `${text}.0`;
}

export function colorLiteral(c: RGB): string {
  return `color(${num(c.r)}, ${num(c.g)}, ${num(c.b)})`;
}

export function stringLiteral(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const INDENT = "    ";

export function renderExpr(expr: MdlExpr, depth = 0): string {
  if (typeof expr === "string") return expr;
  if (expr.args.length === 0) return `${expr.call}()`;

  const pad = INDENT.repeat(depth + 1);
  const body = expr.args
    .map(([name, value]) => {
      const rendered = renderExpr(value, depth + 1);
      // An empty name means a positional argument, as in an array constructor.
      return name ? `${pad}${name}: ${rendered}` : `${pad}${rendered}`;
    })
    .join(",\n");
  return `${expr.call}(\n${body}\n${INDENT.repeat(depth)})`;
}

/**
 * One-line rendering, for an expression embedded in a conditional: MDL's
 * `?:` reads badly split across the multi-line layout above, and a bsdf
 * conditional is short enough to stay on one line.
 */
export function renderInline(expr: MdlExpr): string {
  if (typeof expr === "string") return expr;
  if (expr.args.length === 0) return `${expr.call}()`;
  const body = expr.args
    .map(([name, value]) => (name ? `${name}: ${renderInline(value)}` : renderInline(value)))
    .join(", ");
  return `${expr.call}(${body})`;
}

/** Records which standard modules were actually used, so imports can't drift. */
export class ImportTracker {
  private readonly used = new Set<AllowedModule>();

  use(module: AllowedModule): string {
    this.used.add(module);
    return module;
  }

  /** Qualified reference, e.g. df::specular_bsdf, registering the import. */
  ref(module: AllowedModule, symbol: string): string {
    return `${this.use(module)}::${symbol}`;
  }

  imports(): string[] {
    return [...this.used].sort().map((m) => `import ::${m}::*;`);
  }
}

/** Line-based text buffer with indentation. */
export class CodeWriter {
  private readonly lines: string[] = [];
  private depth = 0;

  line(text = ""): this {
    this.lines.push(text ? `${INDENT.repeat(this.depth)}${text}` : "");
    return this;
  }

  /** Emit pre-rendered multi-line text, re-indenting each line. */
  block(text: string): this {
    for (const line of text.split("\n")) this.line(line);
    return this;
  }

  comment(lines: string[]): this {
    for (const line of lines) this.line(line ? `// ${line}` : "//");
    return this;
  }

  indent(): this {
    this.depth++;
    return this;
  }

  outdent(): this {
    this.depth = Math.max(0, this.depth - 1);
    return this;
  }

  toString(): string {
    return `${this.lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  }
}
