import {
  ROLLER_WAVE_DEPTH_MM,
  ROLLER_WAVE_FILE,
  ROLLER_WAVE_SCALE_PARAM,
  ROLLER_WAVE_STRENGTH_PARAM,
  ROLLER_WAVE_WAVELENGTH_MM,
  rollerWaveNormalMap,
  rollerWaveStrength,
} from "../mdl/emit/rollerWave";
import type { MaterialIR, MaterialParamIR, ModuleFunctionIR } from "../types/ir";
import type { RollerWaveInput } from "../types/system";

/**
 * Attach the roller wave normal map to a set of glass materials: the shared
 * UV helper function, the two tuning parameters, the geometry hook, and the
 * per-material provenance note. Appearance-only; the solved optics are
 * untouched.
 */
export function applyRollerWave(
  materials: MaterialIR[],
  rollerWave: RollerWaveInput,
  prefix: string,
): { textures: { fileName: string; bytes: Uint8Array }[] } {
  const fnName = `${prefix}_roller_wave_uvw`;
  // Always horizontal: an installed facade's lites share the fabricator's
  // furnace direction, so a uniform orientation is the realistic one.
  const fn: ModuleFunctionIR = {
    kind: "roller-wave-uvw",
    name: fnName,
    direction: "horizontal",
  };

  const params: MaterialParamIR[] = [
    {
      name: ROLLER_WAVE_STRENGTH_PARAM,
      type: "float",
      defaultValue: rollerWaveStrength(rollerWave.depth),
      displayName: "Roller wave strength",
      description:
        `Heat-treatment ripple. Default matches the ${rollerWave.depth} preset ` +
        `(${ROLLER_WAVE_DEPTH_MM[rollerWave.depth]}mm peak-to-valley over ` +
        `${ROLLER_WAVE_WAVELENGTH_MM}mm); set 0 for optically flat glass.`,
    },
    {
      name: ROLLER_WAVE_SCALE_PARAM,
      type: "float",
      defaultValue: 1,
      displayName: "Roller wave scale",
      description:
        "Multiplies the wave's physical size. Leave at 1.0 when the object uses a 1 m x 1 m UVW map.",
    },
  ];

  for (const material of materials) {
    material.normalMap = { textureFileName: ROLLER_WAVE_FILE, uvwFunction: fnName };
    material.moduleFunctions = [...material.moduleFunctions, fn];
    material.params = [...material.params, ...params.map((p) => ({ ...p }))];
    material.comments = [
      ...material.comments,
      `Roller wave (${rollerWave.depth}) ships as ${ROLLER_WAVE_FILE}; ` +
        `${ROLLER_WAVE_STRENGTH_PARAM} tunes it and 0 disables. Assumes 1 UV unit = 1 meter.`,
    ];
  }

  return { textures: [{ fileName: ROLLER_WAVE_FILE, bytes: rollerWaveNormalMap() }] };
}
