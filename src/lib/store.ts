"use client";

import { create } from "zustand";
import {
  DEFAULT_FRIT_OPACITY,
  fraction,
  mm,
  naturalAssemblyOptics,
  type CoatingInput,
  type ExportMode,
  type FritInput,
  type FritPattern,
  type GlazingSystemInput,
  type LiteInput,
  type RGB,
  type SubstrateTint,
  type SurfaceNumber,
} from "@/engine";
import type { DisplayUnit } from "./units";
import type { UploadedTexture } from "./textureUpload";

/**
 * Form state.
 *
 * Lengths are stored in millimetres regardless of the display unit, so the
 * engine never has to know a toggle exists and switching units can't drift
 * values through repeated rounding.
 */

const defaultLite = (thicknessMm = 6): LiteInput => ({
  thickness: mm(thicknessMm),
  substrate: "clear",
});

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Performance numbers the construction naturally produces. Used as defaults
 * so the tool never opens (or lands, after a construction change) in a state
 * its own fit check calls wrong — and never touched again once the user has
 * entered a number of their own.
 */
const seededAssembly = (
  lites: LiteInput[],
  assembly: GlazingSystemInput["assembly"],
): GlazingSystemInput["assembly"] => {
  const natural = naturalAssemblyOptics(lites);
  return {
    ...assembly,
    tvis: fraction(round3(natural.tvis)),
    rvisExt: fraction(round3(natural.rvisExt)),
    rvisInt: fraction(round3(natural.rvisInt)),
  };
};

/** A clear 6mm monolithic lite: the simplest thing that is already correct. */
const defaultSystem = (): GlazingSystemInput => {
  const lites = [defaultLite()];
  return {
    name: "Untitled glazing",
    lites,
    gaps: [],
    assembly: seededAssembly(lites, {
      tvis: fraction(0.88),
      rvisExt: fraction(0.08),
      rvisInt: fraction(0.08),
    }),
  };
};

export interface AppState {
  system: GlazingSystemInput;
  mode: ExportMode;
  unit: DisplayUnit;
  /** Set the first time the user edits a performance number; before that,
   * construction changes re-seed the defaults to the natural values. */
  assemblyEdited: boolean;
  /** Kept beside the system because the engine only receives bytes. */
  uploadedMask?: UploadedTexture;

  setName: (name: string) => void;
  setMode: (mode: ExportMode) => void;
  setUnit: (unit: DisplayUnit) => void;
  setLiteCount: (count: number) => void;
  updateLite: (index: number, patch: Partial<LiteInput>) => void;
  setGapWidth: (index: number, widthMm: number) => void;
  setAssembly: (patch: Partial<GlazingSystemInput["assembly"]>) => void;
  setCoating: (liteIndex: number, coating: CoatingInput | undefined) => void;
  moveCoatingToSurface: (surface: SurfaceNumber) => void;
  setFrit: (frit: FritInput | undefined) => void;
  updateFrit: (patch: Partial<FritInput>) => void;
  setFritPattern: (pattern: FritPattern) => void;
  setUploadedMask: (texture: UploadedTexture | undefined) => void;
  loadSystem: (system: GlazingSystemInput) => void;
}

export const useAppStore = create<AppState>((set) => ({
  system: defaultSystem(),
  mode: "planar",
  unit: "mm",
  assemblyEdited: false,

  setName: (name) => set((s) => ({ system: { ...s.system, name } })),
  setMode: (mode) => set({ mode }),
  setUnit: (unit) => set({ unit }),

  setLiteCount: (count) =>
    set((s) => {
      const clamped = Math.max(1, Math.min(3, count));
      const lites = Array.from(
        { length: clamped },
        (_, i) => s.system.lites[i] ?? defaultLite(i === 1 && clamped === 3 ? 4 : 6),
      );
      const gaps = Array.from(
        { length: clamped - 1 },
        (_, i) => s.system.gaps[i] ?? { width: mm(12) },
      );

      // A coating or frit may have been placed on a surface that no longer
      // exists; drop the placement rather than emitting an invalid material.
      const highest = clamped * 2;
      const cleaned = lites.map((lite) =>
        lite.coating && lite.coating.surface > highest ? { ...lite, coating: undefined } : lite,
      );
      const frit =
        s.system.frit && s.system.frit.surface > highest
          ? { ...s.system.frit, surface: highest as SurfaceNumber }
          : s.system.frit;

      const assembly = s.assemblyEdited
        ? s.system.assembly
        : seededAssembly(cleaned, s.system.assembly);
      return { system: { ...s.system, lites: cleaned, gaps, frit, assembly } };
    }),

  updateLite: (index, patch) =>
    set((s) => {
      const lites = s.system.lites.map((lite, i) => (i === index ? { ...lite, ...patch } : lite));
      const affectsOptics = "thickness" in patch || "substrate" in patch;
      const assembly =
        !s.assemblyEdited && affectsOptics
          ? seededAssembly(lites, s.system.assembly)
          : s.system.assembly;
      return { system: { ...s.system, lites, assembly } };
    }),

  setGapWidth: (index, widthMm) =>
    set((s) => ({
      system: {
        ...s.system,
        gaps: s.system.gaps.map((gap, i) => (i === index ? { width: mm(widthMm) } : gap)),
      },
    })),

  setAssembly: (patch) =>
    set((s) => ({
      system: { ...s.system, assembly: { ...s.system.assembly, ...patch } },
      assemblyEdited:
        s.assemblyEdited || "tvis" in patch || "rvisExt" in patch || "rvisInt" in patch,
    })),

  setCoating: (liteIndex, coating) =>
    set((s) => ({
      system: {
        ...s.system,
        // Only one coating is fitted at a time, so setting one clears the rest.
        lites: s.system.lites.map((lite, i) =>
          i === liteIndex ? { ...lite, coating } : { ...lite, coating: undefined },
        ),
      },
    })),

  moveCoatingToSurface: (surface) =>
    set((s) => {
      const existing = s.system.lites.find((l) => l.coating)?.coating;
      const owner = Math.floor((surface - 1) / 2);
      const coating: CoatingInput = { ...(existing ?? { kind: "low-e" }), surface };
      return {
        system: {
          ...s.system,
          lites: s.system.lites.map((lite, i) =>
            i === owner ? { ...lite, coating } : { ...lite, coating: undefined },
          ),
        },
      };
    }),

  setFrit: (frit) => set((s) => ({ system: { ...s.system, frit } })),

  updateFrit: (patch) =>
    set((s) => ({
      system: s.system.frit ? { ...s.system, frit: { ...s.system.frit, ...patch } } : s.system,
    })),

  setFritPattern: (pattern) =>
    set((s) => ({
      system: s.system.frit ? { ...s.system, frit: { ...s.system.frit, pattern } } : s.system,
    })),

  setUploadedMask: (texture) =>
    set((s) => {
      if (s.uploadedMask && s.uploadedMask.previewUrl !== texture?.previewUrl) {
        URL.revokeObjectURL(s.uploadedMask.previewUrl);
      }
      return { uploadedMask: texture };
    }),

  loadSystem: (system) => set({ system }),
}));

/** Starting point when frit is switched on. */
export function defaultFrit(surface: SurfaceNumber, color: RGB): FritInput {
  return {
    pattern: { kind: "dots", dotDiameter: mm(6), spacing: mm(12) },
    color,
    surface,
    opacity: fraction(DEFAULT_FRIT_OPACITY),
  };
}

export const SUBSTRATE_ORDER: SubstrateTint[] = [
  "clear",
  "low-iron",
  "green",
  "gray",
  "bronze",
  "blue",
];
