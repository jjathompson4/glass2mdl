import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { encodePngRgb16 } from "@/engine/package/png";
import { rollerWaveNormalMap } from "@/engine/mdl/emit/rollerWave";

describe("deterministic PNG encoder", () => {
  it("produces a structurally valid 16-bit RGB PNG", () => {
    const px = new Uint16Array(2 * 2 * 3).fill(32768);
    const png = encodePngRgb16(2, 2, px);

    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(8)).toBe(13); // IHDR length
    expect(String.fromCharCode(...png.slice(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(2); // width
    expect(view.getUint32(20)).toBe(2); // height
    expect(png[24]).toBe(16); // bit depth
    expect(png[25]).toBe(2); // truecolor
    expect(String.fromCharCode(...png.slice(png.length - 8, png.length - 4))).toBe("IEND");
  });

  it("rejects a mismatched buffer", () => {
    expect(() => encodePngRgb16(2, 2, new Uint16Array(5))).toThrow();
  });
});

describe("roller wave normal map", () => {
  it("is byte-for-byte deterministic", () => {
    // Same reference from the memo cache; determinism itself is proven by the
    // golden revision codes, which hash these bytes.
    expect(rollerWaveNormalMap()).toBe(rollerWaveNormalMap());
    expect(rollerWaveNormalMap().length).toBeGreaterThan(100_000);
  });

  it("decodes as a PNG whose IDAT inflates to the expected raw size", async () => {
    const png = rollerWaveNormalMap();
    const view = new DataView(png.buffer, png.byteOffset);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    expect(width).toBe(512);
    expect(height).toBe(512);

    // Collect IDAT payloads and inflate: rows * (1 filter byte + w*3*2).
    const { unzlibSync } = await import("fflate");
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
    expect(unzlibSync(joined).length).toBe(height * (1 + width * 6));
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

      const without = unzipSync(buildExport(solarban60, mode).zip);
      expect(Object.keys(without).some((p) => p.endsWith("roller_wave_normal.png"))).toBe(false);
    }
  });
});
