import { describe, expect, it } from "vitest";
import { fitAssembly, fitResidual, locateSurface, maxSurface } from "@/engine/physics/assembly";
import { luminance } from "@/engine/physics/color";
import { fraction, mm, type RGB } from "@/engine/types/optics";
import type { GlazingSystemInput } from "@/engine/types/system";

const monolithicClear = (tvis: number, rvis: number): GlazingSystemInput => ({
  name: "test",
  lites: [{ thickness: mm(6), substrate: "clear" }],
  gaps: [],
  assembly: { tvis: fraction(tvis), rvisExt: fraction(rvis), rvisInt: fraction(rvis) },
});

/** Vitro Solarban 60 on clear, 1" double IGU: 70% Tvis, 11% exterior reflectance. */
const solarban60: GlazingSystemInput = {
  name: "Solarban 60 on clear",
  lites: [
    {
      thickness: mm(6),
      substrate: "clear",
      coating: { kind: "low-e", surface: 2, reflectedColor: { r: 0.8, g: 0.85, b: 0.9 } },
    },
    { thickness: mm(6), substrate: "clear" },
  ],
  gaps: [{ width: mm(12) }],
  assembly: { tvis: fraction(0.7), rvisExt: fraction(0.11), rvisInt: fraction(0.12) },
};

describe("surface numbering", () => {
  it("maps the standard #1-#6 convention onto lites and faces", () => {
    expect(locateSurface(1)).toEqual({ lite: 0, face: "front" });
    expect(locateSurface(2)).toEqual({ lite: 0, face: "back" }); // the usual low-e position
    expect(locateSurface(3)).toEqual({ lite: 1, face: "front" });
    expect(locateSurface(6)).toEqual({ lite: 2, face: "back" });
  });

  it("bounds surface numbers by lite count", () => {
    expect(maxSurface(1)).toBe(2);
    expect(maxSurface(2)).toBe(4);
    expect(maxSurface(3)).toBe(6);
  });
});

describe("uncoated fits", () => {
  it("hits the measured Tvis exactly for a monolithic lite", () => {
    for (const tvis of [0.4, 0.62, 0.88]) {
      const fit = fitAssembly(monolithicClear(tvis, 0.08));
      expect(luminance(fit.achieved.t)).toBeCloseTo(tvis, 6);
    }
  });

  it("lands near 8% reflectance for clear glass without being told to", () => {
    const residual = fitResidual(fitAssembly(monolithicClear(0.88, 0.08)), monolithicClear(0.88, 0.08));
    expect(Math.abs(residual.rvisExt)).toBeLessThan(0.01);
  });

  it("reports a reflectance residual when the cutsheet disagrees with bare glass", () => {
    const input = monolithicClear(0.88, 0.3); // 30% reflectance needs a coating
    const residual = fitResidual(fitAssembly(input), input);
    expect(residual.tvis).toBeCloseTo(0, 6); // transmittance still honored
    expect(Math.abs(residual.rvisExt)).toBeGreaterThan(0.1); // and the gap is surfaced
  });

  it("keeps a tinted substrate's hue while matching the measured level", () => {
    const bronze: GlazingSystemInput = {
      ...monolithicClear(0.52, 0.06),
      lites: [{ thickness: mm(6), substrate: "bronze" }],
    };
    const fit = fitAssembly(bronze);
    expect(luminance(fit.achieved.t)).toBeCloseTo(0.52, 6);
    expect(fit.achieved.t.r).toBeGreaterThan(fit.achieved.t.b); // warm, as bronze must be
  });
});

describe("coated IGU fits", () => {
  it("reproduces all three Solarban 60 measurements", () => {
    const residual = fitResidual(fitAssembly(solarban60), solarban60);
    expect(Math.abs(residual.tvis)).toBeLessThan(1e-3);
    expect(Math.abs(residual.rvisExt)).toBeLessThan(1e-3);
    expect(Math.abs(residual.rvisInt)).toBeLessThan(1e-3);
  });

  it("produces a physically valid coating (absorptance never negative)", () => {
    const fit = fitAssembly(solarban60);
    expect(fit.coating).toBeDefined();
    const channels: (keyof RGB)[] = ["r", "g", "b"];
    for (const c of channels) {
      expect(fit.coating!.tau[c]).toBeGreaterThan(0);
      expect(fit.coating!.tau[c] + fit.coating!.rExt[c]).toBeLessThanOrEqual(1 + 1e-9);
      expect(fit.coating!.tau[c] + fit.coating!.rInt[c]).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("carries the coating's reflected colour into the fitted reflectance", () => {
    const fit = fitAssembly(solarban60);
    expect(fit.achieved.rFront.b).toBeGreaterThan(fit.achieved.rFront.r); // cool blue coating
  });

  it("places the coating on the surface the user specified", () => {
    expect(fitAssembly(solarban60).coating!.location).toEqual({ lite: 0, face: "back" }); // surface #2
  });

  it("handles a triple IGU", () => {
    const triple: GlazingSystemInput = {
      name: "triple",
      lites: [
        { thickness: mm(6), substrate: "clear", coating: { kind: "low-e", surface: 2 } },
        { thickness: mm(4), substrate: "clear" },
        { thickness: mm(6), substrate: "clear" },
      ],
      gaps: [{ width: mm(12) }, { width: mm(12) }],
      assembly: { tvis: fraction(0.6), rvisExt: fraction(0.15), rvisInt: fraction(0.16) },
    };
    const residual = fitResidual(fitAssembly(triple), triple);
    expect(residual.max).toBeLessThan(1e-3);
    expect(fitAssembly(triple).internalT).toHaveLength(3);
  });

  it("reaches the closest achievable answer for impossible inputs rather than failing", () => {
    const impossible: GlazingSystemInput = {
      ...solarban60,
      assembly: { tvis: fraction(0.9), rvisExt: fraction(0.5), rvisInt: fraction(0.5) },
    };
    const fit = fitAssembly(impossible);
    const residual = fitResidual(fit, impossible);
    expect(residual.max).toBeGreaterThan(0.01); // honestly reported...
    for (const v of [fit.achieved.t.r, fit.achieved.rFront.r, fit.achieved.rBack.r]) {
      expect(Number.isFinite(v)).toBe(true); // ...and still a usable material
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
