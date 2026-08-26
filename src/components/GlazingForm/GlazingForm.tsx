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
import { SegmentedControl, TextInput } from "@/components/ui/fields";
import { AssemblySection } from "./AssemblySection";
import { ConstructionSection } from "./ConstructionSection";
import { DiagramPanel } from "./DiagramPanel";
import { CoatingCard, FritCard } from "./FeatureCards";
import { ResultSection } from "./ResultSection";
import { ValidationBanner } from "./ValidationBanner";

/**
 * Diagram-first: the cross-section panel stays on screen while one column of
 * equal-width cards scrolls beneath it — Construction, one card per surface
 * feature, the cutsheet numbers, then the download. The panel's tags and the
 * cards point at each other, so the drawing is the map of the whole form.
 */
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
    <div>
      <div className="mx-auto flex max-w-[820px] flex-wrap items-center gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <TextInput
            value={system.name}
            onChange={setName}
            placeholder="Product name, e.g. Solarban 60 on clear"
            ariaLabel="Product name"
          />
        </div>
        <SegmentedControl<ExportMode>
          ariaLabel="How the glazing is modeled in 3ds Max"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "planar",
              label: "Flat planes",
              title:
                "Each opening is a single plane with no thickness. One material for the whole assembly.",
            },
            {
              value: "volumetric",
              label: "Solid lites",
              title:
                "Each lite is a real solid with its own material; reflections stack the way real IGUs do.",
            },
          ]}
        />
      </div>

      <DiagramPanel derived={solved?.derived ?? null} />

      <div className="mx-auto max-w-[820px] space-y-4 px-5 py-5">
        <ConstructionSection />
        <CoatingCard derived={solved?.derived ?? null} />
        <FritCard />
        <AssemblySection />
        <ValidationBanner issues={modeIssues} warnings={solved?.warnings ?? []} />
        <ResultSection derived={solved?.derived ?? null} bundle={bundle} blocked={exportBlocked} />
      </div>
    </div>
  );
}
