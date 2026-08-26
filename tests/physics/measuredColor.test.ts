import { describe, expect, it } from "vitest";
import { fitAssembly, fitResidual } from "@/engine/physics/assembly";
import { luminance } from "@/engine/physics/color";
import { validateForMode, validateSystem, hasErrors } from "@/engine/validate/validate";
import { fraction, mm } from "@/engine/types/optics";
import type { ColorSpec } from "@/engine/types/color";
import type { GlazingSystemInput } from "@/engine/types/system";

const base: GlazingSystemInput = {
  name: "Measured colour IGU",
  lites: [
    { thickness: mm(6), substrate: "clear", coating: { kind: "low-e", surface: 2 } },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: { tvis: fraction(0.7), rvisExt: fraction(0.11), rvisInt: fraction(0.12) },
};

const withColor = (patch: Partial<GlazingSystemInput["assembly"]>): GlazingSystemInput => ({
  ...base,
  assembly: { ...base.assembly, ...patch },
});

describe("measured colour drives hue, not level", () => {
  it("still reproduces the cutsheet numbers exactly", () => {
    const input = withColor({
      transmittedColor: { kind: "lab", L: 87, a: -4, b: 1.5 },
      reflectedColorExt: { kind: "lab", L: 40, a: -2, b: -6 },
    });
    const residual = fitResidual(fitAssembly(input), input);
    expect(residual.max).toBeLessThan(1e-3);
  });

  it("changes the transmitted hue without moving the transmitted level", () => {
    const neutral = fitAssembly(withColor({ transmittedColor: { kind: "lab", L: 87, a: 0, b: 0 } }));
    const green = fitAssembly(withColor({ transmittedColor: { kind: "lab", L: 87, a: -12, b: 4 } }));

    expect(luminance(neutral.achieved.t)).toBeCloseTo(luminance(green.achieved.t), 3);
    expect(green.achieved.t.g / green.achieved.t.r).toBeGreaterThan(
      neutral.achieved.t.g / neutral.achieved.t.r,
    );
  });

  it("gives the two reflected sides independent hues", () => {
    const fit = fitAssembly(
      withColor({
        reflectedColorExt: { kind: "lab", L: 40, a: 0, b: -14 }, // cool outside
        reflectedColorInt: { kind: "lab", L: 41, a: 6, b: 14 }, // warm inside
      }),
    );

    expect(fit.achieved.rFront.b).toBeGreaterThan(fit.achieved.rFront.r);
    expect(fit.achieved.rBack.r).toBeGreaterThan(fit.achieved.rBack.b);
  });

  it("keeps using the substrate tint table when no colour is measured", () => {
    const bronze: GlazingSystemInput = {
      name: "Bronze",
      lites: [{ thickness: mm(6), substrate: "bronze" }],
      gaps: [],
      assembly: { tvis: fraction(0.52), rvisExt: fraction(0.06), rvisInt: fraction(0.06) },
    };
    const fit = fitAssembly(bronze);
    expect(fit.achieved.t.r).toBeGreaterThan(fit.achieved.t.b);
  });

  it("lets a measured colour override the tint table's guess", () => {
    const bronzeSubstrate: GlazingSystemInput = {
      name: "Bronze but measured cool",
      lites: [{ thickness: mm(6), substrate: "bronze" }],
      gaps: [],
      assembly: {
        tvis: fraction(0.52),
        rvisExt: fraction(0.06),
        rvisInt: fraction(0.06),
        transmittedColor: { kind: "lab", L: 77, a: -3, b: -10 },
      },
    };
    const fit = fitAssembly(bronzeSubstrate);
    expect(fit.achieved.t.b).toBeGreaterThan(fit.achieved.t.r); // measurement wins
  });
});

describe("lightness cross-check", () => {
  const check = (spec: ColorSpec, tvis: number) =>
    validateSystem(withColor({ transmittedColor: spec, tvis: fraction(tvis) })).filter(
      (i) => i.code === "lightness-mismatch",
    );

  it("stays quiet when L* agrees with the entered transmittance", () => {
    expect(check({ kind: "lab", L: 87, a: -2, b: 1 }, 0.7)).toHaveLength(0);
  });

  it("warns when they disagree, naming both numbers", () => {
    const issues = check({ kind: "lab", L: 87, a: -2, b: 1 }, 0.45);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning"); // a warning, not a block
    expect(issues[0].message).toContain("87");
    expect(issues[0].message).toContain("45%");
  });

  it("says nothing for specs that carry no level", () => {
    expect(check({ kind: "xy", x: 0.31, y: 0.33 }, 0.45)).toHaveLength(0);
    expect(check({ kind: "srgb", hex: "#aabbcc" }, 0.45)).toHaveLength(0);
  });
});

describe("coating overrides", () => {
  const pinned: GlazingSystemInput = {
    ...base,
    lites: [
      {
        thickness: mm(6),
        substrate: "clear",
        coating: {
          kind: "low-e",
          surface: 2,
          overrides: { reflectanceExt: { r: 0.3, g: 0.3, b: 0.3 } },
        },
      },
      { thickness: mm(6), substrate: "clear" },
    ],
  };

  it("holds a pinned value exactly", () => {
    const fit = fitAssembly(pinned);
    expect(fit.coating!.rExt.r).toBeCloseTo(0.3, 9);
    expect(fit.coating!.rExt.g).toBeCloseTo(0.3, 9);
  });

  it("reports the cost of contradicting the cutsheet", () => {
    // 30% at the coated surface cannot yield an 11% assembly, so the residual
    // must grow rather than the override being quietly ignored.
    const withOverride = fitResidual(fitAssembly(pinned), pinned);
    const without = fitResidual(fitAssembly(base), base);

    expect(without.max).toBeLessThan(1e-3);
    expect(withOverride.max).toBeGreaterThan(0.05);
  });

  it("pushes the free parameters as far as energy conservation allows", () => {
    // A coating reflecting 30% can transmit at most 70%, so transmittance is
    // driven to its ceiling rather than to the 70% assembly target — reaching
    // that would require the coating to both reflect and transmit 70%.
    const fit = fitAssembly(pinned);
    const tau = fit.coating!.tau;

    for (const channel of ["r", "g", "b"] as const) {
      expect(tau[channel]).toBeCloseTo(1 - 0.3, 2);
      expect(tau[channel] + fit.coating!.rExt[channel]).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(luminance(fit.achieved.t)).toBeLessThan(0.7);
    expect(luminance(fit.achieved.t)).toBeGreaterThan(0.5); // as high as it can get
  });
});

describe("volumetric coating guard", () => {
  it("allows a coated volumetric export, with a warning that explains the setup", () => {
    // The refusal was lifted 2026-08-25 once the Material-ID assembly was
    // render-validated; what remains is one-time 3ds Max setup, surfaced as a
    // warning rather than a block.
    const issues = validateForMode(base, "volumetric");
    const setup = issues.find((i) => i.code === "volumetric-coating-setup");

    expect(setup?.severity).toBe("warning");
    expect(setup?.message).toContain("Material-ID");
    expect(setup?.message).toContain("interior_face");
    expect(hasErrors(issues)).toBe(false);
  });

  it("allows the same construction as a planar export", () => {
    expect(hasErrors(validateForMode(base, "planar"))).toBe(false);
  });

  it("allows uncoated volumetric exports, which are exact", () => {
    const uncoated: GlazingSystemInput = {
      ...base,
      lites: [
        { thickness: mm(6), substrate: "clear" },
        { thickness: mm(6), substrate: "clear" },
      ],
      assembly: { tvis: fraction(0.78), rvisExt: fraction(0.14), rvisInt: fraction(0.14) },
    };
    expect(hasErrors(validateForMode(uncoated, "volumetric"))).toBe(false);
  });
});
