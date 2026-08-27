import { encodePngRgb16 } from "../../package/png";
import type { ModuleFunctionIR } from "../../types/ir";
import { CodeWriter, ImportTracker } from "./writer";

/**
 * Roller wave: the faint periodic ripple tempering rollers leave in
 * heat-treated glass. It is what makes rendered reflections read as glass
 * instead of a mirror-perfect CG plane, so exports ship it as a tangent-space
 * normal map wired into every glass material's geometry.
 *
 * Variability is the point (identical ripple on every IGU is its own CG
 * tell): one large tile carries several waves that differ from each other —
 * incommensurate secondary wavelengths plus low-frequency amplitude and phase
 * modulation and a seeded irregularity — and the Max apply script offsets
 * each object's UVs so no two lites sample the same region.
 */

export const ROLLER_WAVE_FILE = "roller_wave_normal.png";

/** One texture tile spans this much glass under the 1 UV = 1 meter rule. */
export const ROLLER_WAVE_TILE_METERS = 2.4;

/** The industry-typical wavelength the primary component is baked at. */
export const ROLLER_WAVE_WAVELENGTH_MM = 300;

/**
 * The map stores slopes exaggerated by this factor over a "typical" 0.08mm
 * peak-to-valley wave; the material's strength parameter divides it back
 * out. Baking exaggerated keeps the 16-bit samples well above quantization
 * while the defaults stay small honest numbers.
 */
const BAKE_EXAGGERATION = 32;

/** Peak-to-valley depth presets, in millimeters over a 300mm wave. */
export const ROLLER_WAVE_DEPTH_MM: Record<"subtle" | "typical" | "strong", number> = {
  subtle: 0.03,
  typical: 0.08,
  strong: 0.15,
};

const REFERENCE_DEPTH_MM = ROLLER_WAVE_DEPTH_MM.typical;

/** Material parameter names shared by emit, solvers, and the README. */
export const ROLLER_WAVE_STRENGTH_PARAM = "roller_wave_strength";
export const ROLLER_WAVE_SCALE_PARAM = "roller_wave_scale";

/** The strength parameter default that realizes a given depth preset. */
export function rollerWaveStrength(depth: keyof typeof ROLLER_WAVE_DEPTH_MM): number {
  return Math.round((ROLLER_WAVE_DEPTH_MM[depth] / REFERENCE_DEPTH_MM / BAKE_EXAGGERATION) * 1e5) / 1e5;
}

const SIZE = 512;

/** Deterministic PRNG so the map's bytes never depend on the environment. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a small lattice, tileable across the map. */
function makeNoise(seed: number, cells: number): (u: number, v: number) => number {
  const rand = mulberry32(seed);
  const lattice: number[] = [];
  for (let i = 0; i < cells * cells; i++) lattice.push(rand() * 2 - 1);
  const at = (ix: number, iy: number) =>
    lattice[((iy % cells) + cells) % cells * cells + (((ix % cells) + cells) % cells)];
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fy;
  };
}

const TAU = Math.PI * 2;

/**
 * Surface height in meters at a point on the tile (u, v in 0..1), for a wave
 * running along u. Every term is periodic in the tile so the map tiles
 * seamlessly; the secondary wavelengths are near-incommensurate with the
 * primary (rounded to whole cycles per tile), which is what keeps any two
 * waves in the tile from matching.
 */
function buildHeightField(): (u: number, v: number) => number {
  const tileMm = ROLLER_WAVE_TILE_METERS * 1000;
  const cycles = (wavelengthMm: number) => Math.max(1, Math.round(tileMm / wavelengthMm));
  const primary = cycles(ROLLER_WAVE_WAVELENGTH_MM); // 8 cycles
  const second = cycles(211); // 11 cycles
  const third = cycles(487); // 5 cycles
  const amplitude = (REFERENCE_DEPTH_MM / 2) * BAKE_EXAGGERATION * 1e-3; // meters
  const ampNoise = makeNoise(0x9e3779b9, 5);
  const phaseNoise = makeNoise(0x85ebca6b, 4);
  const microNoise = makeNoise(0xc2b2ae35, 11);

  return (u, v) => {
    const drift = phaseNoise(u, v) * 0.9;
    const envelope = 0.72 + 0.28 * ampNoise(u, v);
    const wave =
      Math.sin(TAU * (primary * u + drift)) +
      0.34 * Math.sin(TAU * (second * u + 0.27) + drift * 2.1) +
      0.22 * Math.sin(TAU * (third * u + 0.71) - drift * 1.4);
    const micro = 0.1 * microNoise(u, v);
    return amplitude * (envelope * wave + micro);
  };
}

let cachedMap: Uint8Array | null = null;

/**
 * The shipped tangent-space normal map: slopes of the height field, encoded
 * as 16-bit RGB with the usual (n * 0.5 + 0.5) mapping. Deterministic and
 * memoized; `contentRevision` hashes these bytes, so the map participates in
 * cache-busting like every other shipped file.
 */
export function rollerWaveNormalMap(): Uint8Array {
  if (cachedMap) return cachedMap;
  const height = buildHeightField();
  const tile = ROLLER_WAVE_TILE_METERS;
  const step = 1 / SIZE;
  const pixels = new Uint16Array(SIZE * SIZE * 3);
  let p = 0;
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      // Central differences across the tile (wrapping keeps it seamless).
      const dhdu = (height(u + step, v) - height(u - step, v)) / (2 * step * tile);
      const dhdv = (height(u, v + step) - height(u, v - step)) / (2 * step * tile);
      const inv = 1 / Math.sqrt(dhdu * dhdu + dhdv * dhdv + 1);
      const n = [-dhdu * inv, -dhdv * inv, inv];
      for (let c = 0; c < 3; c++) {
        pixels[p++] = Math.max(0, Math.min(65535, Math.round((n[c] * 0.5 + 0.5) * 65535)));
      }
    }
  }
  cachedMap = encodePngRgb16(SIZE, SIZE, pixels);
  return cachedMap;
}

/**
 * Emit the module-level UV helper the normal lookup uses: real-world UVs
 * scaled to the tile, with the axes swapped for a vertical wave. Kept as a
 * named function (like the frit patterns) so the material expression stays
 * readable and the direction choice is visible in the .mdl source.
 */
export function emitRollerWaveUvw(
  writer: CodeWriter,
  imports: ImportTracker,
  fn: Extract<ModuleFunctionIR, { kind: "roller-wave-uvw" }>,
): void {
  const texCoord = `${imports.ref("state", "texture_coordinate")}(0)`;
  writer.comment([
    "Roller wave UV helper: one texture tile spans "
      + `${ROLLER_WAVE_TILE_METERS} m under the 1 UV unit = 1 meter convention.`,
    // The map's wave varies along its own U axis, so ridge orientation is
    // set by which real-world axis feeds U: V for horizontal ridges (the
    // installed norm), U for vertical.
    fn.direction === "horizontal"
      ? "Axes are swapped so the ridges run horizontally, the installed norm."
      : "Ridges run vertically.",
  ]);
  writer.line(`export float3 ${fn.name}(uniform float scale = 1.0)`);
  writer.line("{");
  writer.indent();
  writer.line(`float3 uvw = ${texCoord};`);
  if (fn.direction === "horizontal") {
    writer.line(`return float3(uvw.y, uvw.x, 0.0) / (${ROLLER_WAVE_TILE_METERS} * scale);`);
  } else {
    writer.line(`return float3(uvw.x, uvw.y, 0.0) / (${ROLLER_WAVE_TILE_METERS} * scale);`);
  }
  writer.outdent();
  writer.line("}");
  writer.line();
}

/**
 * Validation-kit probe only: a 0..1 value from state::object_id(), used to
 * test whether this Iray build gives materials per-object identity. If it
 * does, a future version can vary roller wave phase per object inside the
 * material itself instead of through UV offsets.
 */
export function emitObjectIdProbe(
  writer: CodeWriter,
  imports: ImportTracker,
  fn: Extract<ModuleFunctionIR, { kind: "object-id-probe" }>,
): void {
  const objectId = `${imports.ref("state", "object_id")}()`;
  const frac = imports.ref("math", "frac");
  writer.line(`export float ${fn.name}()`);
  writer.line("{");
  writer.indent();
  writer.line(`return ${frac}(float(${objectId}) * 0.6180339887);`);
  writer.outdent();
  writer.line("}");
  writer.line();
}
