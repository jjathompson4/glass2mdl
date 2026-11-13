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
import { SiteFooter } from "@/components/ui/SiteFooter";
import { AssemblySection } from "./AssemblySection";
import { ConstructionSection } from "./ConstructionSection";
import { DiagramPanel } from "./DiagramPanel";
import { SurfaceFeaturesSection } from "./FeatureCards";
import { fitVerdict } from "./fitVerdict";
import { RenderingSection } from "./RenderingSection";
import { ResultPane } from "./ResultPane";
import { ResultSection } from "./ResultSection";
import { ValidationBanner, jumpToName } from "./ValidationBanner";
import { downloadBytes } from "@/lib/download";

/**
 * Two layouts from one form.
 *
 * Desktop (lg and up) is a workbench: the inputs scroll in a left pane while
 * the result pane (cross-section, produced numbers, verdict, download) stays
 * on screen the whole time, so every keystroke shows its consequence without
 * scrolling. The window itself never scrolls.
 *
 * Phones keep one column: the cross-section panel leads and condenses to a
 * pinned bar, the cards follow, and a bottom bar keeps the verdict and the
 * download within reach.
 */

export function GlazingForm() {
  const system = useAppStore((s) => s.system);
  const mode = useAppStore((s) => s.mode);
  const assemblyEdited = useAppStore((s) => s.assemblyEdited);

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
    <div className="lg:flex lg:h-full lg:flex-row-reverse">
      <aside aria-label="Result" className="hidden min-w-0 flex-1 overflow-y-auto lg:block">
        <ResultPane derived={solved?.derived ?? null} bundle={bundle} blocked={exportBlocked} />
      </aside>

      <div className="border-border-subtle lg:w-[540px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:bg-surface">
        <div className="lg:hidden">
          <DiagramPanel derived={solved?.derived ?? null} />
        </div>

        <div className="mx-auto max-w-[820px] space-y-4 px-4 pb-28 pt-4 sm:px-5 lg:max-w-none lg:space-y-6 lg:px-7 lg:pb-8 lg:pt-6">
          <AssemblySection />
          <ConstructionSection />
          <SurfaceFeaturesSection derived={solved?.derived ?? null} />
          <RenderingSection />
          <ValidationBanner issues={modeIssues} warnings={solved?.warnings ?? []} />
          <div className="lg:hidden">
            <ResultSection derived={solved?.derived ?? null} bundle={bundle} blocked={exportBlocked} />
          </div>
          <div className="hidden lg:block">
            <SiteFooter />
          </div>
        </div>
      </div>

      <MobileDownloadBar
        verdictText={
          solved?.derived
            ? assemblyEdited
              ? fitVerdict(solved.derived, system.assembly).chipCompact
              : "starting estimate"
            : "nothing to fit yet"
        }
        off={Boolean(solved?.derived && assemblyEdited && fitVerdict(solved.derived, system.assembly).tone === "off")}
        nameMissing={system.name.trim() === ""}
        blocked={exportBlocked}
        fileCount={bundle?.files.length ?? 0}
        onDownload={() => {
          const fresh = buildExport(system, mode);
          downloadBytes(fresh.zip, fresh.fileName);
        }}
      />
    </div>
  );
}

/** Phones only: the verdict and the download, pinned to the bottom edge. */
function MobileDownloadBar({
  verdictText,
  off,
  nameMissing,
  blocked,
  fileCount,
  onDownload,
}: {
  verdictText: string;
  off: boolean;
  nameMissing: boolean;
  blocked: boolean;
  fileCount: number;
  onDownload: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border-subtle bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13px] font-medium ${off ? "text-warning" : "text-foreground"}`}>
          {verdictText}
        </p>
        <p className="truncate text-xs text-muted">
          {nameMissing ? "needs a name" : blocked ? "something to fix first" : `${fileCount} files ready`}
        </p>
      </div>
      {nameMissing ? (
        <button
          type="button"
          onClick={jumpToName}
          className="h-12 shrink-0 rounded-[10px] border border-accent px-4 text-[15px] font-semibold text-accent"
        >
          Name the glazing
        </button>
      ) : (
        <button
          type="button"
          onClick={onDownload}
          disabled={blocked}
          className="h-12 shrink-0 rounded-[10px] bg-accent px-5 text-base font-semibold text-white disabled:opacity-40"
        >
          Download ZIP
        </button>
      )}
    </div>
  );
}
