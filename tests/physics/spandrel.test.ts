import { describe, expect, it } from "vitest";
import { fitAssembly, spandrelAppearance } from "@/engine/physics/assembly";
import { luminance } from "@/engine/physics/color";
import { bareInterface, slabOptics, stackTwo } from "@/engine/physics/slab";
import { validateSystem, validateForMode } from "@/engine/validate/validate";
import { fraction, mm } from "@/engine/types/optics";
import type { GlazingSystemInput } from "@/engine/types/system";

const clear6 = (spandrel: GlazingSystemInput["spandrel"]): GlazingSystemInput => ({
  name: "spandrel test",
  lites: [{ thickness: mm(6), substrate: "clear" }],
  gaps: [],
  assembly: { tvis: fraction(0.88), rvisExt: fraction(0.08), rvisInt: fraction(0.08) },
  spandrel,
});

/** A mid-gray swatch: sRGB 50% is about 21% linear albedo. */
const gray50 = { kind: "srgb", hex: "#808080" } as const;

describe("spandrel appearance", () => {
  it("is absent for vision glass", () => {
    const input = clear6(undefined);
    expect(spandrelAppearance(fitAssembly(input), input)).toBeUndefined();
  });

  it("flood coat: glass reflection plus the paint seen through a double pass", () => {
    const input = clear6({ kind: "flood-coat", surface: 2, color: gray50 });
    const fit = fitAssembly(input);
    const seen = spandrelAppearance(fit, input)!;

    for (const c of ["r", "g", "b"] as const) {
      const rho = seen.finish[c];
      const expected = slabOptics(fit.internalT[0][c], bareInterface(), { rExt: rho, rInt: 0, tau: 0 });
      expect(seen.readsAs[c]).toBeCloseTo(expected.rFront, 9);
    }
    expect(luminance(seen.finish)).toBeCloseTo(0.2159, 3); // level taken as given
    expect(luminance(seen.readsAs)).toBeGreaterThan(luminance(seen.glassOnly));
    expect(luminance(seen.readsAs)).toBeLessThan(luminance(seen.finish) + luminance(seen.glassOnly));
    expect(luminance(seen.glassOnly)).toBeCloseTo(0.0426, 3); // one bare interface
  });

  it("back pan: the whole glass stack, then an opaque element", () => {
    const input = clear6({ kind: "back-pan", cavity: mm(100), color: gray50, finish: "matte" });
    const fit = fitAssembly(input);
    const seen = spandrelAppearance(fit, input)!;

    for (const c of ["r", "g", "b"] as const) {
      const glass = slabOptics(fit.internalT[0][c], bareInterface(), bareInterface());
      const expected = stackTwo(glass, { t: 0, rFront: seen.finish[c], rBack: 0 });
      expect(seen.readsAs[c]).toBeCloseTo(expected.rFront, 9);
    }
    expect(seen.glassOnly.g).toBeCloseTo(fit.achieved.rFront.g, 9);
  });

  it("flood coat on #2 of a double unit hides the inner lite", () => {
    const igu: GlazingSystemInput = {
      ...clear6({ kind: "flood-coat", surface: 2, color: gray50 }),
      lites: [
        { thickness: mm(6), substrate: "clear" },
        { thickness: mm(6), substrate: "gray" },
      ],
      gaps: [{ width: mm(12) }],
    };
    const fit = fitAssembly(igu);
    const seen = spandrelAppearance(fit, igu)!;
    // Only the outer lite's body enters; the gray inner lite is behind the paint.
    for (const c of ["r", "g", "b"] as const) {
      const expected = slabOptics(fit.internalT[0][c], bareInterface(), { rExt: seen.finish[c], rInt: 0, tau: 0 });
      expect(seen.readsAs[c]).toBeCloseTo(expected.rFront, 9);
    }
  });

  it("a darker finish reads darker, a lighter one lighter", () => {
    const dark = clear6({ kind: "flood-coat", surface: 2, color: { kind: "srgb", hex: "#202020" } });
    const light = clear6({ kind: "flood-coat", surface: 2, color: { kind: "lab", L: 80, a: 0, b: 0 } });
    const a = spandrelAppearance(fitAssembly(dark), dark)!;
    const b = spandrelAppearance(fitAssembly(light), light)!;
    expect(luminance(a.readsAs)).toBeLessThan(luminance(b.readsAs));
    expect(luminance(b.finish)).toBeCloseTo(0.5647, 2); // L* 80
  });
});

describe("spandrel validation", () => {
  const codes = (input: GlazingSystemInput) => validateSystem(input).map((i) => i.code);

  it("accepts a flood coat on a back face", () => {
    expect(codes(clear6({ kind: "flood-coat", surface: 2, color: gray50 }))).not.toContain(
      "spandrel-surface-front",
    );
  });

  it("rejects a flood coat on an outward-facing surface", () => {
    expect(codes(clear6({ kind: "flood-coat", surface: 1, color: gray50 }))).toContain(
      "spandrel-surface-front",
    );
  });

  it("rejects a surface the construction does not have", () => {
    expect(codes(clear6({ kind: "flood-coat", surface: 4, color: gray50 }))).toContain(
      "spandrel-surface-range",
    );
  });

  it("refuses frit and spandrel together", () => {
    const input: GlazingSystemInput = {
      ...clear6({ kind: "flood-coat", surface: 2, color: gray50 }),
      frit: {
        pattern: { kind: "uniform", coverage: fraction(0.4) },
        color: { r: 0.9, g: 0.9, b: 0.9 },
        surface: 2,
        opacity: fraction(0.95),
      },
    };
    expect(codes(input)).toContain("spandrel-with-frit");
  });

  it("warns when the flood coat covers the coating", () => {
    const input: GlazingSystemInput = {
      ...clear6({ kind: "flood-coat", surface: 2, color: gray50 }),
      lites: [{ thickness: mm(6), substrate: "clear", coating: { kind: "low-e", surface: 2 } }],
    };
    expect(codes(input)).toContain("spandrel-covers-coating");
  });

  it("needs a cavity for a back pan and flags odd depths", () => {
    expect(codes(clear6({ kind: "back-pan", cavity: mm(0), color: gray50, finish: "matte" }))).toContain(
      "spandrel-cavity-required",
    );
    expect(codes(clear6({ kind: "back-pan", cavity: mm(900), color: gray50, finish: "matte" }))).toContain(
      "spandrel-cavity-unusual",
    );
    expect(codes(clear6({ kind: "back-pan", cavity: mm(100), color: gray50, finish: "matte" }))).toEqual([]);
  });

  it("notes the Material-ID setup for a volumetric flood coat", () => {
    const issues = validateForMode(clear6({ kind: "flood-coat", surface: 2, color: gray50 }), "volumetric");
    expect(issues.map((i) => i.code)).toContain("volumetric-spandrel-setup");
    expect(validateForMode(clear6({ kind: "flood-coat", surface: 2, color: gray50 }), "planar").map((i) => i.code)).not.toContain(
      "volumetric-spandrel-setup",
    );
  });
});
