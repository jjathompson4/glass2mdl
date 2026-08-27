import { describe, expect, it } from "vitest";
import { unzipSync, unzlibSync } from "fflate";
import { encodePngRgb8, encodePngRgb16 } from "@/engine/package/png";
import { rollerWaveNormalMap } from "@/engine/mdl/emit/rollerWave";

/** Pull the inflated raw stream (filter bytes + samples) out of a PNG. */
function rawStream(png: Uint8Array): { width: number; height: number; raw: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  let offset = 8;
  const idat: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.slice(offset + 4, offset + 8));
    if (type === "IDAT") idat.push(png.slice(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const joined = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of idat) {
    joined.set(c, at);
    at += c.length;
  }
  return { width, height, raw: unzlibSync(joined) };
}

/** Undo the Sub filter, returning packed sample bytes. */
function unfilter(raw: Uint8Array, width: number, height: number, bytesPerPixel: number): Uint8Array {
  const rowBytes = width * bytesPerPixel;
  const out = new Uint8Array(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const src = y * (1 + rowBytes);
    expect(raw[src]).toBe(1); // Sub filter on every row
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bytesPerPixel ? out[y * rowBytes + i - bytesPerPixel] : 0;
      out[y * rowBytes + i] = (raw[src + 1 + i] + left) & 0xff;
    }
  }
  return out;
}

describe("deterministic PNG encoder", () => {
  it("produces a structurally valid 8-bit RGB PNG", () => {
    const px = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    const png = encodePngRgb8(2, 2, px);

    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(8)).toBe(13); // IHDR length
    expect(String.fromCharCode(...png.slice(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(2); // width
    expect(view.getUint32(20)).toBe(2); // height
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(2); // truecolor
    expect(String.fromCharCode(...png.slice(png.length - 8, png.length - 4))).toBe("IEND");
  });

  it("round-trips 8-bit pixels through the Sub filter", () => {
    const px = new Uint8Array(3 * 2 * 3).map((_, i) => (i * 37) & 0xff);
    const png = encodePngRgb8(3, 2, px);
    const { width, height, raw } = rawStream(png);
    expect(unfilter(raw, width, height, 3)).toEqual(px);
  });

  it("round-trips 16-bit pixels through the Sub filter big-endian", () => {
    const px = new Uint16Array([0, 1, 258, 65535, 32768, 4660]);
    const png = encodePngRgb16(2, 1, px);
    expect(png[24]).toBe(16);
    const { width, height, raw } = rawStream(png);
    const samples = unfilter(raw, width, height, 6);
    const decoded = [];
    for (let i = 0; i < samples.length; i += 2) decoded.push((samples[i] << 8) | samples[i + 1]);
    expect(decoded).toEqual([...px]);
  });

  it("rejects a mismatched buffer", () => {
    expect(() => encodePngRgb8(2, 2, new Uint8Array(5))).toThrow();
    expect(() => encodePngRgb16(2, 2, new Uint16Array(5))).toThrow();
  });
});

describe("roller wave normal map", () => {
  it("is byte-for-byte deterministic", () => {
    // Same reference from the memo cache; determinism itself is proven by the
    // golden revision codes, which hash these bytes.
    expect(rollerWaveNormalMap()).toBe(rollerWaveNormalMap());
    expect(rollerWaveNormalMap().length).toBeGreaterThan(10_000);
  });

  it("decodes to plausible normal-map pixels with the wave along V", () => {
    const png = rollerWaveNormalMap();
    const { width, height, raw } = rawStream(png);
    expect(width).toBe(512);
    expect(height).toBe(512);
    expect(png[24]).toBe(8); // 8-bit: the format every loader reads

    const samples = unfilter(raw, width, height, 3);
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255;
    for (let i = 0; i < samples.length; i += 3) {
      rMin = Math.min(rMin, samples[i]);
      rMax = Math.max(rMax, samples[i]);
      gMin = Math.min(gMin, samples[i + 1]);
      gMax = Math.max(gMax, samples[i + 1]);
      bMin = Math.min(bMin, samples[i + 2]);
    }
    // Z stays near 1 (the perturbation is a tilt, not a cliff).
    expect(bMin).toBeGreaterThan(230);
    // The wave varies along V, so the strong signal lives in G...
    expect(gMin).toBeLessThan(105);
    expect(gMax).toBeGreaterThan(150);
    // ...and R carries only the mild cross-wave irregularity.
    expect(rMin).toBeGreaterThan(100);
    expect(rMax).toBeLessThan(165);
    expect(rMax - rMin).toBeGreaterThan(2); // but it is not constant
  });
});

describe("roller wave in the export bundle", () => {
  it("ships the map in both modes when enabled, and not otherwise", async () => {
    const { buildExport } = await import("@/engine/package/exportBundle");
    const { rollerWaveIgu, solarban60 } = await import("../mdl/fixtures");

    for (const mode of ["planar", "volumetric"] as const) {
      const withWave = unzipSync(buildExport(rollerWaveIgu, mode).zip);
      expect(Object.keys(withWave).some((p) => p.endsWith("roller_wave_normal.png"))).toBe(true);
      const mdlEntry = Object.entries(withWave).find(([p]) => p.endsWith(".mdl"))!;
      const source = new TextDecoder().decode(mdlEntry[1]);
      expect(source).toContain("tangent_space_normal_texture");
      expect(source).toContain('texture_2d("./roller_wave_normal.png"');
      expect(source).toContain("coordinate_source");
      // The tangent-frame trap: never hand-build texture_coordinate_info for
      // a normal map (its tangent defaults are constant axis vectors).
      expect(source).not.toContain("texture_coordinate_info(position: ");

      const without = unzipSync(buildExport(solarban60, mode).zip);
      expect(Object.keys(without).some((p) => p.endsWith("roller_wave_normal.png"))).toBe(false);
    }
  });
});
