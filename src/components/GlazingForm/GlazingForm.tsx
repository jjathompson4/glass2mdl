"use client";

import { useMemo } from "react";
import {
  buildExport,
  hasErrors,
  solveSystem,
  validateForMode,
  validateSystem,
  type ExportMode,
} from "@/engine";
import { useAppStore } from "@/lib/store";
import { Field, TextInput } from "@/components/ui/fields";
import { AssemblySection } from "./AssemblySection";
import { ConstructionSection } from "./ConstructionSection";
import { DiagramPanel } from "./DiagramPanel";
import { CoatingCard, FritCard, SurfaceFeaturesGhost } from "./FeatureCards";
import { ResultSection } from "./ResultSection";
import { ValidationBanner } from "./ValidationBanner";

/**
 * Diagram-first: the cross-section panel stays on screen while one column of
 * equal-width cards scrolls beneath it — Construction, one card per surface
 * feature, the cutsheet numbers, then the download. The panel's tags and the
 * cards point at each other, so the drawing is the map of the whole form.
 */

const MODES: { value: ExportMode; label: string; blurb: string }[] = [
  {
    value: "planar",
    label: "Planar geometry",
    blurb: "Each opening is a single plane with no thickness.",
  },
  {
    value: "volumetric",
    label: "Solid lites geometry",
    blurb: "Each lite is a real solid; reflections stack like real IGUs.",
  },
];

/** Small pictogram: one surface versus stacked solids. */
function ModeGlyph({ mode, active }: { mode: ExportMode; active: boolean }) {
  const stroke = active ? "var(--accent)" : "var(--border-strong)";
  return (
    <svg viewBox="0 0 34 20" className="h-5 w-8 shrink-0" aria-hidden>
      {mode === "planar" ? (
        <line x1={17} y1={2} x2={17} y2={18} stroke={stroke} strokeWidth={2.5} />
      ) : (
        <>
          <rect x={8} y={2} width={5} height={16} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={1.5} />
          <rect x={21} y={2} width={5} height={16} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}
export function GlazingForm() {
  const system = useAppStore((s) => s.system);
  const mode = useAppStore((s) => s.mode);
  const setName = useAppStore((s) => s.setName);
  const setMode = useAppStore((s) => s.setMode);

  // Two levels of validation. System-level says whether the glazing can be
  // solved at all; mode-level adds restrictions that apply only to the chosen
  // export. Keeping them apart means a mode restriction blocks the download
  // without also blanking the fit check that explains the glazing.
  const systemIssues = useMemo(() => validateSystem(system), [system]);
  const modeIssues = useMemo(() => validateForMode(system, mode), [system, mode]);
  // A missing name blocks the download (via modeIssues) but not the physics:
  // the fit and its verdict describe the glazing, which has no name.
  const solvable = !systemIssues.some(
    (issue) => issue.severity === "error" && issue.code !== "name-required",
  );
  const exportBlocked = hasErrors(modeIssues);

  // Solving is closed-form over at most three lites, so it runs inline on every
  // keystroke rather than behind a debounce or a worker.
  const solved = useMemo(
    () => (solvable ? solveSystem(system, mode) : null),
    [system, mode, solvable],
  );
  const bundle = useMemo(
    () => (exportBlocked ? null : buildExport(system, mode)),
    [system, mode, exportBlocked],
  );

  return (
    <div>
      <div className="mx-auto max-w-[820px] px-5 pb-3 pt-5">
        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <div className="max-w-md">
            <Field label="Product name" hint="Used for the material and file names.">
              <TextInput
                value={system.name}
                onChange={setName}
                placeholder="e.g. Solarban 60 on clear"
                ariaLabel="Product name"
              />
            </Field>
          </div>

          {/* The geometry choice decides everything the tool generates, so its
              two options carry their explanations in plain sight. */}
          <div className="mt-3.5">
            <p className="text-xs font-medium text-muted">
              How is the glazing modeled in your 3ds Max scene?
            </p>
            <div
              role="radiogroup"
              aria-label="How the glazing is modeled in 3ds Max"
              className="mt-1.5 grid gap-2 sm:grid-cols-2"
            >
              {MODES.map((option) => {
                const selected = mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMode(option.value)}
                    className={`rounded-md border p-3 text-left transition ${
                      selected
                        ? "border-accent bg-accent-soft"
                        : "border-border-subtle hover:border-border-strong"
                    }`}
                  >
                    <span
                      className={`flex items-center gap-2.5 text-[13px] font-semibold ${
                        selected ? "text-accent" : "text-foreground"
                      }`}
                    >
                      <ModeGlyph mode={option.value} active={selected} />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-muted">
                      {option.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-3.5 border-t border-border-subtle pt-2.5 text-[11px] text-muted/80">
            Fill in each card, then download the ZIP at the bottom.
          </p>
        </section>
      </div>

      <DiagramPanel derived={solved?.derived ?? null} />

      <div className="mx-auto max-w-[820px] space-y-4 px-5 py-5">
        <ConstructionSection />
        <CoatingCard derived={solved?.derived ?? null} />
        <FritCard />
        <SurfaceFeaturesGhost />
        <AssemblySection />
        <ValidationBanner issues={modeIssues} warnings={solved?.warnings ?? []} />
        <ResultSection derived={solved?.derived ?? null} bundle={bundle} blocked={exportBlocked} />
      </div>
    </div>
  );
}
