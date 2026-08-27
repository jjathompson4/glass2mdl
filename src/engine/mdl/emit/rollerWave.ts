import { encodePngRgb8 } from "../../package/png";
import type { ModuleFunctionIR } from "../../types/ir";
import { CodeWriter, ImportTracker } from "./writer";

/**
 * Roller wave: the faint periodic ripple tempering rollers leave in
 * heat-treated glass. It is what makes rendered reflections read as glass
 * instead of a mirror-perfect CG plane.
 *
 * The ripple lives entirely on the 3ds Max side: exports ship a grayscale
 * bump map (bright = high) and the bundled apply script wires it into the
 * Iray+ MDL material's "geometry normal" map channel as an ordinary Max
 * bitmap node, visible and tweakable in Slate. Nothing rides inside the MDL:
 * `material_geometry.normal` in MDL source is silently ignored by Iray+ 3.1
 * (field-confirmed twice, docs/iray-findings.md 7.6), while the plugin's own
 * Max-side channel is field-confirmed to work.
 *
 * Variability is the point (identical ripple on every IGU is its own CG
 * tell): one large tile carries several waves that differ from each other —
 * incommensurate secondary wavelengths plus low-frequency amplitude and phase
 * modulation and a seeded irregularity — and the apply script offsets each
 * object's UVs so no two lites sample the same region.
 *
 * The wave varies along V, so under the 1 UV unit = 1 meter box mapping
 * (V vertical on a facade) the ridges run horizontally, the installed norm:
 * a facade's lites share the fabricator's furnace direction.
 */

export const ROLLER_WAVE_FILE = "roller_wave_bump.png";

/** One texture tile spans this much glass under the 1 UV = 1 meter rule. */
export const ROLLER_WAVE_TILE_METERS = 2.4;

/** The industry-typical wavelength the primary component is baked at. */
export const ROLLER_WAVE_WAVELENGTH_MM = 300;

/**
 * Peak-to-valley depth presets, in millimeters over a 300mm wave. The map is
 * normalized to full range; depth lands as the Max bitmap node's output
 * amount, scaled by preset relative to "typical".
 */
export const ROLLER_WAVE_DEPTH_MM: Record<"subtle" | "typical" | "strong", number> = {
  subtle: 0.03,
  typical: 0.08,
  strong: 0.15,
};

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
 * Surface height at a point on the tile (u, v in 0..1), unitless — the map
 * is normalized afterward, so only the shape matters here. The wave runs
 * along v; every term is periodic in the tile so the map tiles seamlessly,
 * and the secondary wavelengths are near-incommensurate with the primary
 * (rounded to whole cycles per tile), which is what keeps any two waves in
 * the tile from matching.
 */
function buildHeightField(): (u: number, v: number) => number {
  const tileMm = ROLLER_WAVE_TILE_METERS * 1000;
  const cycles = (wavelengthMm: number) => Math.max(1, Math.round(tileMm / wavelengthMm));
  const primary = cycles(ROLLER_WAVE_WAVELENGTH_MM); // 8 cycles
  const second = cycles(211); // 11 cycles
  const third = cycles(487); // 5 cycles
  const ampNoise = makeNoise(0x9e3779b9, 5);
  const phaseNoise = makeNoise(0x85ebca6b, 4);
  const microNoise = makeNoise(0xc2b2ae35, 11);

  return (u, v) => {
    const drift = phaseNoise(u, v) * 0.9;
    const envelope = 0.72 + 0.28 * ampNoise(u, v);
    const wave =
      Math.sin(TAU * (primary * v + drift)) +
      0.34 * Math.sin(TAU * (second * v + 0.27) + drift * 2.1) +
      0.22 * Math.sin(TAU * (third * v + 0.71) - drift * 1.4);
    const micro = 0.1 * microNoise(u, v);
    return envelope * wave + micro;
  };
}

let cachedMap: Uint8Array | null = null;

/**
 * The shipped grayscale bump map (r = g = b, bright = high), normalized to
 * the full 0..255 range so the depth control lives entirely on the Max side.
 * Deterministic and memoized; `contentRevision` hashes these bytes, so the
 * map participates in cache-busting like every other shipped file.
 */
export function rollerWaveBumpMap(): Uint8Array {
  if (cachedMap) return cachedMap;
  const height = buildHeightField();
  const values = new Float64Array(SIZE * SIZE);
  let min = Infinity;
  let max = -Infinity;
  let p = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const h = height(x / SIZE, y / SIZE);
      values[p++] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  const range = max - min || 1;
  const pixels = new Uint8Array(SIZE * SIZE * 3);
  for (let i = 0; i < values.length; i++) {
    const level = Math.round(((values[i] - min) / range) * 255);
    pixels[i * 3] = level;
    pixels[i * 3 + 1] = level;
    pixels[i * 3 + 2] = level;
  }
  cachedMap = encodePngRgb8(SIZE, SIZE, pixels);
  return cachedMap;
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
  // The scale parameter is unused; weight functions are always called with
  // the material's frit_pattern_scale, so the signature must accept it.
  writer.line(`export float ${fn.name}(uniform float scale = 1.0)`);
  writer.line("{");
  writer.indent();
  writer.line(`return ${frac}(float(${objectId}) * 0.6180339887);`);
  writer.outdent();
  writer.line("}");
  writer.line();
}
