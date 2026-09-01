import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { fraction } from "@/engine";
import { buildExport } from "@/engine/package/exportBundle";
import { backPanMatte, dotFrit, floodCoatIgu, maskFrit, solarban60, MASK_BYTES } from "../mdl/fixtures";

/** Unpack a bundle the way a user's ZIP tool would. */
function unpack(zip: Uint8Array) {
  const entries = unzipSync(zip);
  return {
    paths: Object.keys(entries).sort(),
    text: (suffix: string) => {
      const key = Object.keys(entries).find((k) => k.endsWith(suffix));
      if (!key) throw new Error(`No entry ending in ${suffix}. Have: ${Object.keys(entries)}`);
      return strFromU8(entries[key]);
    },
    bytes: (suffix: string) => {
      const key = Object.keys(entries).find((k) => k.endsWith(suffix))!;
      return entries[key];
    },
  };
}

describe("export bundle", () => {
  it("round-trips through a real ZIP reader", () => {
    const bundle = buildExport(solarban60, "volumetric");
    const unpacked = unpack(bundle.zip);

    expect(unpacked.paths).toHaveLength(bundle.files.length);
    expect(unpacked.text(".mdl")).toContain("export material");
    expect(unpacked.text("README.txt")).toContain("INSTALLING");
  });

  it("keeps files in one folder so relative texture paths resolve", () => {
    const unpacked = unpack(buildExport(maskFrit, "volumetric").zip);
    const folders = new Set(unpacked.paths.map((p) => p.split("/")[0]));

    expect(folders.size).toBe(1);
    for (const path of unpacked.paths) expect(path.split("/")).toHaveLength(2);
  });

  it("preserves uploaded texture bytes exactly", () => {
    const unpacked = unpack(buildExport(maskFrit, "volumetric").zip);
    expect(unpacked.bytes("custom_pattern.png")).toEqual(MASK_BYTES);
  });

  it("names the archive after the system and mode", () => {
    expect(buildExport(solarban60, "planar").fileName).toBe("glass2mdl_solarban_60_clear_planar.zip");
    expect(buildExport(solarban60, "volumetric").fileName).toBe(
      "glass2mdl_solarban_60_clear_volumetric.zip",
    );
  });

  it("gives planar and volumetric exports distinct contents", () => {
    const planar = unpack(buildExport(solarban60, "planar").zip);
    const volumetric = unpack(buildExport(solarban60, "volumetric").zip);
    expect(planar.text(".mdl")).not.toBe(volumetric.text(".mdl"));
  });
});

describe("bundled Max apply script", () => {
  it("ships in volumetric exports only, next to its manifest", () => {
    const volumetric = unpack(buildExport(solarban60, "volumetric").zip);
    expect(volumetric.text("glass2mdl_apply.py")).toContain("def bind(");

    const planar = unpack(buildExport(solarban60, "planar").zip);
    expect(planar.paths.some((p) => p.endsWith("glass2mdl_apply.py"))).toBe(false);
  });

  it("is the real script, not a stale embed", async () => {
    // The generated module is committed; editing scripts/max/glass2mdl_apply.py
    // must end with `pnpm embed:max`, and this is what enforces it.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../scripts/max/glass2mdl_apply.py", import.meta.url),
      "utf8",
    );
    const { APPLY_SCRIPT } = await import("@/engine/package/applyScript.generated");
    expect(
      APPLY_SCRIPT === source,
      "src/engine/package/applyScript.generated.ts is stale — run: pnpm embed:max",
    ).toBe(true);
  });
});

describe("bind manifest", () => {
  it("ships in volumetric exports only", () => {
    const volumetric = unpack(buildExport(solarban60, "volumetric").zip);
    expect(volumetric.paths.some((p) => p.endsWith("bind_manifest.json"))).toBe(true);

    const planar = unpack(buildExport(solarban60, "planar").zip);
    expect(planar.paths.some((p) => p.endsWith("bind_manifest.json"))).toBe(false);
  });

  it("describes every lite the way the Max apply script consumes it", () => {
    const unpacked = unpack(buildExport(solarban60, "volumetric").zip);
    const manifest = JSON.parse(unpacked.text("bind_manifest.json"));
    const folder = unpacked.paths[0].split("/")[0];
    const moduleName = unpacked.paths
      .find((p) => p.endsWith(".mdl"))!
      .split("/")[1]
      .replace(/\.mdl$/, "");

    expect(manifest.module).toBe(moduleName);
    const spec = manifest.types.solarban_60_clear;
    expect(spec).toBeDefined();

    // Coated outer lite: interior_face selected per slot, bool-only signature.
    const outer = spec.by_position.outer;
    expect(outer.type_name).toBe(`mdl::${folder}::${moduleName}::solarban_60_clear_outer(bool)`);
    expect(outer.slot_params.exterior.interior_face).toBe(false);
    expect(outer.slot_params.interior.interior_face).toBe(true);
    expect(outer.slot_params.edge.interior_face).toBe(false);

    // Uncoated inner lite: the validated float signature, ior as a shared param.
    const inner = spec.by_position.inner;
    expect(inner.type_name).toBe(`mdl::${folder}::${moduleName}::solarban_60_clear_inner(float)`);
    expect(inner.params.ior).toBeCloseTo(1.52, 6);
    expect(inner.slot_params).toBeUndefined();
  });

  it("keeps the frit decal informational, outside the per-position binding", () => {
    const unpacked = unpack(buildExport(dotFrit, "volumetric").zip);
    const manifest = JSON.parse(unpacked.text("bind_manifest.json"));
    const spec = manifest.types.dot_frit_igu;

    expect(spec.frit_decal.type_name).toContain("_frit_decal(");
    expect(spec.by_position.outer).toBeDefined();
    expect(Object.keys(spec.by_position)).not.toContain("frit_decal");
  });
});

describe("spandrel exports", () => {
  it("ships the back pan as a second type with a default position", () => {
    const unpacked = unpack(buildExport(backPanMatte, "volumetric").zip);
    const manifest = JSON.parse(unpacked.text("bind_manifest.json"));

    expect(Object.keys(manifest.types).sort()).toEqual(["back_pan_matte", "back_pan_matte_pan"]);
    const pan = manifest.types.back_pan_matte_pan;
    expect(pan.by_position._default.type_name).toContain("back_pan_matte_pan(");
    expect(pan.roller_wave).toBe(false);
    expect(manifest.types.back_pan_matte.by_position.outer).toBeDefined();

    const readme = unpacked.text("README.txt");
    expect(readme).toContain("back_pan_matte_pan");
    expect(readme).toContain("Mark selection as this type");
    expect(readme).toContain("SPANDREL");
  });

  it("drives the flood coat through the interior_face slot on the painted lite", () => {
    const unpacked = unpack(buildExport(floodCoatIgu, "volumetric").zip);
    const manifest = JSON.parse(unpacked.text("bind_manifest.json"));
    const inner = manifest.types.flood_coat_igu.by_position.inner;

    expect(inner.type_name).toContain("flood_coat_igu_inner(float,bool)");
    expect(inner.slot_params.interior.interior_face).toBe(true);
    expect(inner.slot_params.exterior.interior_face).toBe(false);
    expect(inner.params.ior).toBeCloseTo(1.52, 6);
    expect(Object.keys(manifest.types)).toEqual(["flood_coat_igu"]);

    const readme = unpacked.text("README.txt");
    expect(readme).toContain("Flood coat on surface #4");
    expect(readme.replace(/\s+/g, " ")).toContain("the panel reads as");
  });

  it("emits the flood coat as a bsdf conditional on interior_face, never a mix", () => {
    const source = unpack(buildExport(floodCoatIgu, "volumetric").zip).text(".mdl");
    expect(source).toContain("interior_face ? df::diffuse_reflection_bsdf(");
  });
});

describe("module revision", () => {
  it("is deterministic: the same input produces the same filename", () => {
    const a = unpack(buildExport(solarban60, "volumetric").zip);
    const b = unpack(buildExport(solarban60, "volumetric").zip);
    expect(a.paths.find((p) => p.endsWith(".mdl"))).toBe(b.paths.find((p) => p.endsWith(".mdl")));
  });

  it("changes when the content changes, so 3ds Max never serves a stale module", () => {
    const base = unpack(buildExport(solarban60, "volumetric").zip);
    const edited = unpack(
      buildExport(
        {
          ...solarban60,
          assembly: { ...solarban60.assembly, tvis: fraction(0.71) },
        },
        "volumetric",
      ).zip,
    );

    const name = (u: ReturnType<typeof unpack>) => u.paths.find((p) => p.endsWith(".mdl"))!;
    expect(name(base)).not.toBe(name(edited));
    // Same base identity, different revision: only the trailing code moves.
    expect(name(base).replace(/_r[0-9a-f]{6}\.mdl$/, "")).toBe(
      name(edited).replace(/_r[0-9a-f]{6}\.mdl$/, ""),
    );
  });
});

describe("README", () => {
  it("names every material and says which pane it belongs on", () => {
    const bundle = buildExport(solarban60, "volumetric");
    const readme = unpack(bundle.zip).text("README.txt");
    const materials = bundle.files.filter((f) => f.kind === "mdl");

    expect(materials).toHaveLength(1);
    for (const name of ["solarban_60_clear_outer", "solarban_60_clear_inner"]) {
      expect(readme).toContain(name);
    }
    expect(readme).toContain("Lite 1 (outer)");
    expect(readme).toContain("Lite 2 (inner)");
  });

  it("explains the decal plane workflow when frit is present", () => {
    const readme = unpack(buildExport(dotFrit, "volumetric").zip).text("README.txt");
    expect(readme).toContain("frit_decal");
    expect(readme).toContain("surface #2");
    expect(readme).toContain("0.1mm");
    expect(readme).toContain("FRIT PATTERN SCALE");
  });

  it("warns the planar export away from solid geometry", () => {
    const readme = unpack(buildExport(solarban60, "planar").zip).text("README.txt");
    expect(readme).toContain("Do not apply this material to a solid");
  });

  it("reports entered values against fitted values", () => {
    const readme = unpack(buildExport(solarban60, "volumetric").zip).text("README.txt");
    expect(readme).toContain("WHAT WAS FITTED");
    expect(readme).toContain("70.0%"); // the Tvis that went in, and came back out
  });

  it("carries solver notes into the download", () => {
    // Anything the solver flags has to survive past the download, or it is lost
    // the moment the ZIP leaves the browser.
    const readme = unpack(buildExport(dotFrit, "volumetric").zip).text("README.txt");
    expect(readme).toContain("NOTES AND APPROXIMATIONS");
    expect(readme).toContain("decal");
  });
});
