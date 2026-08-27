import { describe, expect, it } from "vitest";
import { unzipSync, unzlibSync } from "fflate";
import { encodePngRgb8, encodePngRgb16 } from "@/engine/package/png";

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

describe("roller wave map generation", () => {
  it("is a deterministic grayscale height map spanning the full range", async () => {
    const { rollerWaveBumpMap } = await import("@/engine/mdl/emit/rollerWave");
    expect(rollerWaveBumpMap()).toBe(rollerWaveBumpMap()); // memoized
    const png = rollerWaveBumpMap();
    const { width, height, raw } = rawStream(png);
    expect(width).toBe(512);
    expect(height).toBe(512);
    expect(png[24]).toBe(8);

    const samples = unfilter(raw, width, height, 3);
    let min = 255;
    let max = 0;
    for (let i = 0; i < samples.length; i += 3) {
      // Grayscale: a bump map, not a color image.
      expect(samples[i + 1]).toBe(samples[i]);
      expect(samples[i + 2]).toBe(samples[i]);
      min = Math.min(min, samples[i]);
      max = Math.max(max, samples[i]);
    }
    // Normalized to full range: depth control lives on the Max side.
    expect(min).toBe(0);
    expect(max).toBe(255);
  });
});

describe("roller wave in the export bundle", () => {
  it("ships the bump map and wiring info, and keeps the MDL clean", async () => {
    const { buildExport } = await import("@/engine/package/exportBundle");
    const { rollerWaveIgu, solarban60 } = await import("../mdl/fixtures");

    for (const mode of ["planar", "volumetric"] as const) {
      const withWave = unzipSync(buildExport(rollerWaveIgu, mode).zip);
      expect(Object.keys(withWave).some((p) => p.endsWith("roller_wave_bump.png"))).toBe(true);
      const mdlEntry = Object.entries(withWave).find(([p]) => p.endsWith(".mdl"))!;
      const source = new TextDecoder().decode(mdlEntry[1]);
      // The ripple is Max-side texturing: the MDL must stay out of it
      // (comments may mention the file; code must not). material_geometry's
      // normal is silently ignored by Iray+ 3.1 (iray-findings 7.6) and must
      // never come back without a render proving it.
      expect(source).not.toContain("roller_wave_strength");
      expect(source).not.toContain("tangent_space_normal_texture");
      expect(source).not.toContain("normal: ");

      if (mode === "volumetric") {
        const manifestEntry = Object.entries(withWave).find(([p]) =>
          p.endsWith("bind_manifest.json"),
        )!;
        const manifest = JSON.parse(new TextDecoder().decode(manifestEntry[1]));
        expect(manifest.roller_wave).toEqual({
          file: "roller_wave_bump.png",
          depth: "typical",
          depth_mm: 0.08,
          tile_m: 2.4,
        });
      }

      const without = unzipSync(buildExport(solarban60, mode).zip);
      expect(Object.keys(without).some((p) => p.endsWith("roller_wave_bump.png"))).toBe(false);
      if (mode === "volumetric") {
        const manifestEntry = Object.entries(without).find(([p]) =>
          p.endsWith("bind_manifest.json"),
        )!;
        expect(JSON.parse(new TextDecoder().decode(manifestEntry[1])).roller_wave).toBeUndefined();
      }
    }
  });
});
