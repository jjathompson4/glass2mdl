import type { MaterialIR } from "../../types/ir";
import type { RGB } from "../../types/optics";
import { MDL_VERSION, TOOL_NAME, TOOL_VERSION } from "../target";
import { emitPatternFunction } from "./fritPattern";
import { emitObjectIdProbe } from "./rollerWave";
import { buildScattering, weightExpression } from "./layers";
import {
  CodeWriter,
  ImportTracker,
  call,
  colorLiteral,
  num,
  renderExpr,
  stringLiteral,
  type MdlExpr,
} from "./writer";

export interface EmittedModule {
  fileName: string;
  source: string;
  materialNames: string[];
}

const SCALE_PARAM = "frit_pattern_scale";

function annotations(imports: ImportTracker, material: MaterialIR): string[] {
  return [
    `${imports.ref("anno", "display_name")}(${stringLiteral(material.displayName)})`,
    `${imports.ref("anno", "description")}(${stringLiteral(material.description)})`,
    `${imports.ref("anno", "author")}(${stringLiteral(`${TOOL_NAME} ${TOOL_VERSION}`)})`,
  ];
}

function emitMaterial(writer: CodeWriter, imports: ImportTracker, material: MaterialIR): void {
  writer.comment(material.comments).line();

  // Parameters first: the surface expressions below may reference them.
  if (material.params.length === 0) {
    writer.line(`export material ${material.name}()`);
  } else {
    writer.line(`export material ${material.name}(`).indent();
    material.params.forEach((param, i) => {
      const value =
        param.type === "color"
          ? colorLiteral(param.defaultValue as RGB)
          : param.type === "bool"
            ? (param.defaultValue ? "true" : "false")
            : num(param.defaultValue as number);
      const comma = i === material.params.length - 1 ? "" : ",";
      writer.line(`uniform ${param.type} ${param.name} = ${value}`);
      writer.indent();
      writer.line("[[");
      writer.indent();
      writer.line(`${imports.ref("anno", "display_name")}(${stringLiteral(param.displayName)})${param.description ? "," : ""}`);
      if (param.description) {
        writer.line(`${imports.ref("anno", "description")}(${stringLiteral(param.description)})`);
      }
      writer.outdent();
      writer.line(`]]${comma}`);
      writer.outdent();
    });
    writer.outdent().line(")");
  }

  writer.line("[[").indent();
  const annos = annotations(imports, material);
  annos.forEach((a, i) => writer.line(i === annos.length - 1 ? a : `${a},`));
  writer.outdent().line("]]");

  const args: Array<[string, MdlExpr]> = [
    ["thin_walled", material.thinWalled ? "true" : "false"],
    [
      "surface",
      call("material_surface", [
        ["scattering", buildScattering(imports, material.layers, SCALE_PARAM)],
      ]),
    ],
  ];

  if (material.backface) {
    args.push([
      "backface",
      call("material_surface", [
        ["scattering", buildScattering(imports, material.backface.layers, SCALE_PARAM)],
      ]),
    ]);
  }

  // A material exposing an `ior` parameter routes it through; otherwise the
  // fitted value is baked as a literal.
  const iorParam = material.params.find((p) => p.name === "ior" && p.type === "float");
  args.push(["ior", iorParam ? "color(ior)" : `color(${num(material.ior)})`]);

  if (material.volume) {
    args.push([
      "volume",
      call("material_volume", [
        ["absorption_coefficient", colorLiteral(material.volume.absorptionCoefficient)],
      ]),
    ]);
  }

  const geometryArgs: Array<[string, MdlExpr]> = [];
  if (material.cutoutOpacity) {
    geometryArgs.push([
      "cutout_opacity",
      weightExpression(material.cutoutOpacity, SCALE_PARAM),
    ]);
  }
  // NOTE: no `normal` argument ever goes in material_geometry — Iray+ 3.1
  // silently ignores it (field-confirmed twice, docs/iray-findings.md 7.6).
  // Roller wave lives on the Max side, wired by the apply script into the
  // plugin's own "geometry normal" map channel.
  if (geometryArgs.length) {
    args.push(["geometry", call("material_geometry", geometryArgs)]);
  }

  writer.line(`= ${renderExpr(call("material", args))};`).line();
}

/**
 * Emit one MDL module holding every material for an export.
 *
 * Imports are written from what the emitters actually reached for, not from a
 * hand-maintained list, so a module can never reference a symbol it failed to
 * import — the classic way generated MDL breaks.
 */
export function emitModule(
  moduleName: string,
  materials: MaterialIR[],
  header: string[] = [],
): EmittedModule {
  const imports = new ImportTracker();
  const body = new CodeWriter();

  const emittedFunctions = new Set<string>();
  for (const material of materials) {
    for (const fn of material.moduleFunctions) {
      if (emittedFunctions.has(fn.name)) continue;
      emittedFunctions.add(fn.name);
      if (fn.kind === "object-id-probe") {
        emitObjectIdProbe(body, imports, fn);
      } else {
        emitPatternFunction(body, imports, fn);
      }
    }
  }

  for (const material of materials) emitMaterial(body, imports, material);

  // The header is assembled last: only now is the import set complete.
  const out = new CodeWriter();
  out.line(`mdl ${MDL_VERSION};`).line();
  for (const line of imports.imports()) out.line(line);
  out.line();
  if (header.length) out.comment(header).line();
  out.block(body.toString().trimEnd());

  return {
    fileName: `${moduleName}.mdl`,
    source: out.toString(),
    materialNames: materials.map((m) => m.name),
  };
}
