import { sanitizeTextureFileName } from "@/engine";

export interface UploadedTexture {
  fileName: string;
  bytes: Uint8Array;
  /** Object URL for showing the mask in the form; revoke when replaced. */
  previewUrl: string;
  /** Fraction of white pixels — the frit's actual coverage. */
  coverage: number;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Read an uploaded coverage map into plain bytes plus a measured coverage.
 *
 * The engine only ever sees bytes, never a File — that is what keeps it usable
 * outside a browser. Coverage is measured here because it needs a canvas.
 */
export async function readTextureFile(file: File): Promise<UploadedTexture> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Masks must be under 8MB.`,
    );
  }
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image. Upload a black and white PNG or JPG.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const previewUrl = URL.createObjectURL(file);

  return {
    fileName: sanitizeTextureFileName(file.name),
    bytes,
    previewUrl,
    coverage: await measureCoverage(previewUrl),
  };
}

/** Average luminance of the mask: white is frit, black is open glass. */
async function measureCoverage(url: string): Promise<number> {
  const image = await loadImage(url);

  // Sampling at reduced resolution is plenty for an average and keeps large
  // masks from stalling the form.
  const width = Math.min(image.naturalWidth, 256);
  const height = Math.min(image.naturalHeight, 256);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 1;

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
  }
  return total / (data.length / 4);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be read."));
    image.src = url;
  });
}
