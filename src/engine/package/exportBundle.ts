import { zipSync, strToU8 } from "fflate";
import { toIdentifier } from "../mdl/naming";
import { TOOL_NAME } from "../mdl/target";
import { solveSystem } from "../solve/solveSystem";
import type { ExportMode, GlazingSystemInput } from "../types/system";
import { APPLY_SCRIPT } from "./applyScript.generated";
import { buildBindManifest } from "./manifest";
import { buildReadme } from "./readme";

export interface ExportFile {
  fileName: string;
  kind: "mdl" | "readme" | "texture" | "manifest" | "script";
  bytes: Uint8Array;
}

export interface ExportBundle {
  /** ZIP archive ready to hand to a browser download. */
  zip: Uint8Array;
  /** Name for the downloaded archive. */
  fileName: string;
  /** Everything inside, for showing a file list before download. */
  files: ExportFile[];
}

/**
 * Solve, emit, document, and package in one call.
 *
 * The files land in a folder inside the archive rather than loose at the root:
 * MDL resolves texture references relative to the module, and an unpacked
 * folder is also what the user adds to an MDL search path.
 */
export function buildExport(input: GlazingSystemInput, mode: ExportMode): ExportBundle {
  const solved = solveSystem(input, mode);
  const folder = `${TOOL_NAME}_${toIdentifier(input.name)}_${mode}`;

  const readme = buildReadme({
    input,
    mode,
    materials: solved.materials,
    derived: solved.derived,
    warnings: solved.warnings,
    moduleFileName: solved.module.fileName,
    textureFileNames: solved.textures.map((t) => t.fileName),
  });

  const files: ExportFile[] = [
    { fileName: solved.module.fileName, kind: "mdl", bytes: strToU8(solved.module.source) },
    { fileName: "README.txt", kind: "readme", bytes: strToU8(readme) },
    // Volumetric exports carry the Max apply script and the bind manifest
    // that drives it, so the ZIP is the complete workflow: unzip under an
    // MDL search path, Run Script, follow the window.
    ...(mode === "volumetric"
      ? [
          {
            fileName: "bind_manifest.json",
            kind: "manifest",
            bytes: strToU8(
              buildBindManifest(input, solved.materials, {
                folder,
                module: solved.module.fileName.replace(/\.mdl$/, ""),
              }),
            ),
          } satisfies ExportFile,
          {
            fileName: "glass2mdl_apply.py",
            kind: "script",
            bytes: strToU8(APPLY_SCRIPT),
          } satisfies ExportFile,
        ]
      : []),
    ...solved.textures.map((t): ExportFile => ({
      fileName: t.fileName,
      kind: "texture",
      bytes: t.bytes,
    })),
  ];

  const zip = zipSync(
    Object.fromEntries(files.map((f) => [`${folder}/${f.fileName}`, f.bytes])),
    { level: 6 },
  );

  return { zip, fileName: `${folder}.zip`, files };
}
