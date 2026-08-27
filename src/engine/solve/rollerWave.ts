import {
  ROLLER_WAVE_DEPTH_MM,
  ROLLER_WAVE_FILE,
  ROLLER_WAVE_SCALE_PARAM,
  ROLLER_WAVE_STRENGTH_PARAM,
  ROLLER_WAVE_WAVELENGTH_MM,
  rollerWaveNormalMap,
  rollerWaveStrength,
} from "../mdl/emit/rollerWave";
import type { MaterialIR, MaterialParamIR } from "../types/ir";
import type { RollerWaveInput } from "../types/system";

/**
 * Attach the roller wave normal map to a set of glass materials: the two
 * tuning parameters, the geometry hook, and the per-material provenance
 * note. Appearance-only; the solved optics are untouched. Ridge orientation
 * is baked into the map (horizontal, the installed norm: a facade's lites
 * share the fabricator's furnace direction).
 */
export function applyRollerWave(
  materials: MaterialIR[],
  rollerWave: RollerWaveInput,
): { textures: { fileName: string; bytes: Uint8Array }[] } {
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
    material.normalMap = { textureFileName: ROLLER_WAVE_FILE };
    material.params = [...material.params, ...params.map((p) => ({ ...p }))];
    material.comments = [
      ...material.comments,
      `Roller wave (${rollerWave.depth}) ships as ${ROLLER_WAVE_FILE}; ` +
        `${ROLLER_WAVE_STRENGTH_PARAM} tunes it and 0 disables. Assumes 1 UV unit = 1 meter.`,
    ];
  }

  return { textures: [{ fileName: ROLLER_WAVE_FILE, bytes: rollerWaveNormalMap() }] };
}
