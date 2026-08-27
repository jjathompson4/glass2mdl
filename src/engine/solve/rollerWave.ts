import { ROLLER_WAVE_FILE, rollerWaveBumpMap } from "../mdl/emit/rollerWave";

/**
 * The roller wave's entire engine-side footprint: the grayscale bump map
 * that ships next to the .mdl. Nothing touches the materials — the ripple is
 * pure Max-side texturing (the apply script wires this file into the Iray+
 * material's "geometry normal" channel; see emit/rollerWave.ts for why the
 * MDL itself must stay out of it). Appearance-only; the solved optics are
 * untouched.
 */
export function rollerWaveTexture(): { fileName: string; bytes: Uint8Array } {
  return { fileName: ROLLER_WAVE_FILE, bytes: rollerWaveBumpMap() };
}
