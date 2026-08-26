/** MDL reserved words that must never be produced as an identifier. */
const RESERVED = new Set([
  "material", "export", "import", "using", "mdl", "bsdf", "edf", "vdf", "color",
  "float", "float2", "float3", "float4", "int", "bool", "string", "texture_2d",
  "true", "false", "if", "else", "for", "while", "return", "switch", "case",
  "let", "in", "uniform", "varying", "const", "module", "package", "struct",
  "enum", "typedef", "annotation", "intensity_mode", "auto", "break", "continue",
  "default", "do", "double", "hair_bsdf", "light_profile", "bsdf_measurement",
]);

/**
 * Turn arbitrary user text into a valid, stable MDL identifier: ASCII letters,
 * digits and underscores, never leading with a digit, never a reserved word.
 */
export function toIdentifier(input: string, fallback = "glazing"): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents rather than dropping the letter
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .toLowerCase();

  if (!cleaned) return fallback;
  const safe = /^[0-9]/.test(cleaned) ? `g_${cleaned}` : cleaned;
  return RESERVED.has(safe) ? `${safe}_` : safe;
}

/**
 * File names go next to the .mdl in a ZIP the user unpacks into an MDL search
 * path, so keep them ASCII and free of path separators.
 */
export function toFileName(input: string, extension: string): string {
  const base = toIdentifier(input);
  return `${base}${extension}`;
}

export function sanitizeTextureFileName(input: string): string {
  const dot = input.lastIndexOf(".");
  const stem = dot > 0 ? input.slice(0, dot) : input;
  const ext = dot > 0 ? input.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "") : ".png";
  return `${toIdentifier(stem, "frit_mask")}${ext}`;
}

/** Positional names for the lites of an assembly, exterior to interior. */
export function litePositionNames(count: number): string[] {
  if (count === 1) return ["monolithic"];
  if (count === 2) return ["outer", "inner"];
  if (count === 3) return ["outer", "center", "inner"];
  return Array.from({ length: count }, (_, i) => `lite${i + 1}`);
}

/**
 * Deterministic short revision code for a module's content.
 *
 * 3ds Max caches a loaded MDL module for the whole session and silently keeps
 * serving it after the file changes; only a new filename (or a restart) forces
 * a recompile. Deriving the filename from the content means a re-export that
 * changed anything gets a fresh name automatically, while an identical
 * re-export keeps the old one. FNV-1a is enough here: this is a cache-buster,
 * not a checksum.
 */
export function contentRevision(
  source: string,
  textures: { bytes: Uint8Array }[],
): string {
  let h = 0x811c9dc5;
  const mix = (byte: number) => {
    h ^= byte & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    mix(code);
    if (code > 0xff) mix(code >>> 8);
  }
  for (const texture of textures) {
    for (let i = 0; i < texture.bytes.length; i++) mix(texture.bytes[i]);
  }
  return `r${h.toString(16).padStart(8, "0").slice(0, 6)}`;
}

/** Ensure every name in a module is unique, suffixing duplicates. */
export function uniquify(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}
