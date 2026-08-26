import { describe, expect, it } from "vitest";
import {
  AIR_GLASS_R0,
  REFERENCE_THICKNESS_M,
  SUBSTRATE_INTERNAL_T_6MM,
} from "@/engine/physics/constants";
import {
  absorptionCoefficient,
  bareInterface,
  internalTransmittanceFromTotal,
  retargetThickness,
  slabOptics,
  stackTwo,
} from "@/engine/physics/slab";
import { luminance } from "@/engine/physics/color";

describe("air/glass interface", () => {
  it("reflects about 4.3% at normal incidence for n=1.52", () => {
    expect(AIR_GLASS_R0).toBeCloseTo(0.0426, 4);
  });
});

describe("internalTransmittanceFromTotal", () => {
  it("round-trips through the forward slab relation", () => {
    for (const t of [0.1, 0.3, 0.5, 0.75, 0.9, 0.958, 0.99, 1]) {
      const forward = slabOptics(t, bareInterface(), bareInterface());
      expect(internalTransmittanceFromTotal(forward.t)).toBeCloseTo(t, 9);
    }
  });

  it("recovers ~0.958 body transmittance for 88% Tvis clear float", () => {
    expect(internalTransmittanceFromTotal(0.88)).toBeCloseTo(0.958, 3);
  });

  it("is monotonically increasing in measured transmittance", () => {
    let previous = -1;
    for (let T = 0.05; T <= 0.95; T += 0.05) {
      const t = internalTransmittanceFromTotal(T);
      expect(t).toBeGreaterThan(previous);
      previous = t;
    }
  });

  it("clamps degenerate inputs instead of returning NaN", () => {
    expect(internalTransmittanceFromTotal(0)).toBe(0);
    expect(Number.isFinite(internalTransmittanceFromTotal(1))).toBe(true);
  });
});

describe("slabOptics", () => {
  it("conserves energy for a bare lite", () => {
    for (const t of [0.2, 0.6, 0.958, 1]) {
      const o = slabOptics(t, bareInterface(), bareInterface());
      expect(o.t + o.rFront).toBeLessThanOrEqual(1 + 1e-9);
      expect(o.rFront).toBeCloseTo(o.rBack, 12); // symmetric when both faces are bare
    }
  });

  it("puts a lossless clear lite near 92% transmittance and 8% reflectance", () => {
    const o = slabOptics(1, bareInterface(), bareInterface());
    expect(o.t).toBeCloseTo(0.9184, 3);
    expect(o.rFront).toBeCloseTo(0.0816, 3);
    expect(o.t + o.rFront).toBeCloseTo(1, 9); // no absorption, so it closes exactly
  });

  it("reproduces published 6 mm clear float performance", () => {
    const body = luminance(SUBSTRATE_INTERNAL_T_6MM.clear);
    const o = slabOptics(body, bareInterface(), bareInterface());
    expect(o.t).toBeCloseTo(0.88, 2); // ~88% Tvis
    expect(o.rFront).toBeCloseTo(0.08, 2); // ~8% Rvis
  });
});

describe("stackTwo", () => {
  it("adds inter-reflection: a double lite transmits less than the naive product", () => {
    const lite = slabOptics(0.958, bareInterface(), bareInterface());
    const igu = stackTwo(lite, lite);
    expect(igu.t).toBeGreaterThan(lite.t * lite.t); // gap bounces recover some light
    expect(igu.rFront).toBeGreaterThan(lite.rFront); // second lite adds reflection
    expect(igu.rFront).toBeCloseTo(igu.rBack, 12);
  });

  it("is transparent to a null element", () => {
    const lite = slabOptics(0.9, bareInterface(), bareInterface());
    const nothing = { t: 1, rFront: 0, rBack: 0 };
    const combined = stackTwo(lite, nothing);
    expect(combined.t).toBeCloseTo(lite.t, 12);
    expect(combined.rFront).toBeCloseTo(lite.rFront, 12);
  });
});

describe("thickness scaling", () => {
  it("is a no-op at the reference thickness", () => {
    const t = SUBSTRATE_INTERNAL_T_6MM.green.g;
    expect(retargetThickness(t, REFERENCE_THICKNESS_M, REFERENCE_THICKNESS_M)).toBeCloseTo(t, 12);
  });

  it("absorbs more when thicker and less when thinner", () => {
    const t6 = SUBSTRATE_INTERNAL_T_6MM.bronze.b;
    expect(retargetThickness(t6, REFERENCE_THICKNESS_M, 0.012)).toBeCloseTo(t6 * t6, 9);
    expect(retargetThickness(t6, REFERENCE_THICKNESS_M, 0.003)).toBeCloseTo(Math.sqrt(t6), 9);
  });

  it("yields a plausible absorption coefficient for clear float", () => {
    const sigma = absorptionCoefficient(
      luminance(SUBSTRATE_INTERNAL_T_6MM.clear),
      REFERENCE_THICKNESS_M,
    );
    expect(sigma).toBeGreaterThan(4); // published clear float lands near 7 /m
    expect(sigma).toBeLessThan(12);
  });
});
