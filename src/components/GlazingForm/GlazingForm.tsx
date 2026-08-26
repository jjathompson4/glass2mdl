"use client";

import { useMemo } from "react";
import { buildExport, hasErrors, solveSystem, validateForMode, validateSystem } from "@/engine";
import { useAppStore } from "@/lib/store";
import { AssemblySection } from "./AssemblySection";
import { ConstructionSection } from "./ConstructionSection";
import { FineTuningSection } from "./FineTuningSection";
import { ResultSection } from "./ResultSection";
import { TargetSection } from "./TargetSection";
import { ValidationBanner } from "./ValidationBanner";

/**
 * One guided column, in the order a person with a cutsheet actually works:
 * what am I making, what's the build-up, what does the sheet say, anything
 * optional, then the result. The engine's structure (inputs → fit → output)
 * stays its own business.
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
  const solvable = !hasErrors(systemIssues);
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
    <div className="mx-auto max-w-[820px] space-y-5 px-5 py-6">
      <TargetSection />
      <ConstructionSection />
      <AssemblySection />
      <FineTuningSection derived={solved?.derived ?? null} />
      <ValidationBanner issues={modeIssues} warnings={solved?.warnings ?? []} />
      <ResultSection derived={solved?.derived ?? null} bundle={bundle} blocked={exportBlocked} />
    </div>
  );
}
