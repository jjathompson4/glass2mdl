"use client";

import { useMemo } from "react";
import {
  buildExport,
  hasErrors,
  solveSystem,
  validateForMode,
  validateSystem,
} from "@/engine";
import { useAppStore } from "@/lib/store";
import { AssemblySection } from "./AssemblySection";
import { ConstructionSection } from "./ConstructionSection";
import { DiagramPanel } from "./DiagramPanel";
import { CoatingCard, FritCard, SurfaceFeaturesGhost } from "./FeatureCards";
import { RenderingSection } from "./RenderingSection";
import { ResultSection } from "./ResultSection";
import { ValidationBanner } from "./ValidationBanner";

/**
 * Diagram-first: the cross-section panel sits at the very top and stays on
 * screen while one column of equal-width cards scrolls beneath it — the data
 * sheet header (name + measured values), Construction, one card per surface
 * feature, the rendering choices, then the download proving the numbers were
 * met. The panel's tags and the cards point at each other, so the drawing is
 * the map of the whole form.
 */

export function GlazingForm() {
  const system = useAppStore((s) => s.system);
  const mode = useAppStore((s) => s.mode);

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
      <DiagramPanel derived={solved?.derived ?? null} />

      <div className="mx-auto max-w-[820px] space-y-4 px-5 py-5">
        <AssemblySection />
        <ConstructionSection />
        <CoatingCard derived={solved?.derived ?? null} />
        <FritCard />
        <SurfaceFeaturesGhost />
        <RenderingSection />
        <ValidationBanner issues={modeIssues} warnings={solved?.warnings ?? []} />
        <ResultSection derived={solved?.derived ?? null} bundle={bundle} blocked={exportBlocked} />
      </div>
    </div>
  );
}
