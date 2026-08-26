import { INTERIOR_FACE_PARAM } from "../mdl/emit/layers";
import { litePositionNames, toIdentifier } from "../mdl/naming";
import type { MaterialIR } from "../types/ir";
import type { GlazingSystemInput } from "../types/system";

/**
 * The bind manifest shipped in volumetric exports.
 *
 * It tells the glass2mdl Max apply script (scripts/max/glass2mdl_apply.py) how
 * to create and assign the Iray+ MDL materials with zero manual steps: one
 * fully-qualified type name per lite position, the parameter defaults to set,
 * and the per-slot overrides (interior_face per Material ID). The shape under
 * `types` is exactly what `make_iray_mdl_factory` consumes — the script's
 * `load_manifest()` unwraps this file's envelope.
 *
 * Type names assume the export folder sits directly on an Iray+ MDL search
 * path, which is what the README's install steps produce: the folder becomes
 * the MDL package, the module sits inside it under the same name.
 */

interface SlotParams {
  exterior?: Record<string, boolean | number>;
  interior?: Record<string, boolean | number>;
  edge?: Record<string, boolean | number>;
}

interface MaterialSpec {
  type_name: string;
  params: Record<string, number | boolean>;
  slot_params?: SlotParams;
}

const MDL_PARAM_TYPES = { float: "float", color: "color", bool: "bool" } as const;

/** The folder is the MDL package; the revisioned module file sits inside it. */
function typeName(pkg: string, material: MaterialIR): string {
  const signature = material.params.map((p) => MDL_PARAM_TYPES[p.type]).join(",");
  return `${pkg}::${material.name}(${signature})`;
}

function materialSpec(pkg: string, material: MaterialIR): MaterialSpec {
  const params: Record<string, number | boolean> = {};
  for (const p of material.params) {
    // interior_face is per-slot, not shared; color defaults are baked into
    // the MDL and need no override.
    if (p.name === INTERIOR_FACE_PARAM || p.type === "color") continue;
    params[p.name] = p.defaultValue as number | boolean;
  }

  const spec: MaterialSpec = { type_name: typeName(pkg, material), params };
  if (material.params.some((p) => p.name === INTERIOR_FACE_PARAM)) {
    spec.slot_params = {
      exterior: { [INTERIOR_FACE_PARAM]: false },
      interior: { [INTERIOR_FACE_PARAM]: true },
      edge: { [INTERIOR_FACE_PARAM]: false },
    };
  }
  return spec;
}

export function buildBindManifest(
  input: GlazingSystemInput,
  materials: MaterialIR[],
  names: { folder: string; module: string },
): string {
  const prefix = toIdentifier(input.name);
  const positions = litePositionNames(input.lites.length);
  const pkg = `mdl::${names.folder}::${names.module}`;

  const byPosition: Record<string, MaterialSpec> = {};
  input.lites.forEach((_, i) => {
    byPosition[positions[i]] = materialSpec(pkg, materials[i]);
  });

  const typeEntry: Record<string, unknown> = { by_position: byPosition };
  if (input.frit) {
    // Informational only: the decal goes on a separate plane by hand, so the
    // factory never binds it (extra keys beside by_position are ignored).
    typeEntry.frit_decal = {
      type_name: typeName(pkg, materials[input.lites.length]),
      note: `Assign manually to a decal plane offset ~0.1mm off surface #${input.frit.surface}; not part of the Multi-Sub binding.`,
    };
  }

  const manifest = {
    format: "glass2mdl-bind-manifest",
    version: 1,
    module: names.module,
    note: "type_name values assume the export folder sits directly on an Iray+ MDL search path. Lite position keys match the apply script's g2m_position stamps. The module filename carries a content revision, so re-exports never collide with modules 3ds Max has already cached.",
    types: { [prefix]: typeEntry },
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}
