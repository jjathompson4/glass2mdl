import { zlibSync } from "fflate";

/**
 * Minimal, fully deterministic PNG encoder.
 *
 * The browser's canvas encoder produces different bytes per browser, which
 * would make `contentRevision` (and the golden tests) unstable for generated
 * textures — so the shipped maps are encoded here instead: fixed chunk
 * layout, filter 0 on every row, fflate's zlib at a fixed level.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Encode 16-bit-per-channel RGB pixels as a PNG.
 *
 * `pixels` is width*height*3 samples in row-major order, each 0..65535.
 * Sixteen bits matter here: the roller wave map stores very small normal
 * perturbations, and 8-bit quantization would band visibly in glancing
 * reflections.
 */
export function encodePngRgb16(
  width: number,
  height: number,
  pixels: Uint16Array,
): Uint8Array {
  if (pixels.length !== width * height * 3) {
    throw new Error("pixel buffer does not match dimensions");
  }

  // Raw stream: one filter byte (0 = None) per row, then big-endian samples.
  const rowBytes = width * 6;
  const raw = new Uint8Array(height * (1 + rowBytes));
  let p = 0;
  for (let y = 0; y < height; y++) {
    let o = y * (1 + rowBytes);
    raw[o++] = 0;
    for (let x = 0; x < width * 3; x++) {
      const v = pixels[p++];
      raw[o++] = (v >> 8) & 0xff;
      raw[o++] = v & 0xff;
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 16; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
