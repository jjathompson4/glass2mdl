"use client";

import { useState } from "react";
import { luminance, type DerivedOptics, type ExportBundle } from "@/engine";
import { useAppStore } from "@/lib/store";
import { ActionButton } from "@/components/ui/fields";
import { constructionSummary, useDiagramControls } from "./DiagramPanel";
import { FitLinePanel } from "./FitLinePanel";
import { GlassColorSummary } from "./GlassColorPanel";
import { DownloadBlock } from "./ResultSection";
import { FIT_QUANTITIES, fitVerdict, type FitVerdict } from "./fitVerdict";

/**
 * The desktop layout's right-hand pane: everything the form produces, on
 * screen the whole time. The cross-section is the map, the three tiles say
 * what the materials actually do beside what was asked for, one line gives
 * the verdict, and the download sits where the answer is.
 */
export function ResultPane({
  derived,
  bundle,
  blocked,
}: {
  derived: DerivedOptics | null;
  bundle: ExportBundle | null;
  blocked: boolean;
}) {
  const system = useAppStore((s) => s.system);
  const assemblyEdited = useAppStore((s) => s.assemblyEdited);
  const { diagram, picker } = useDiagramControls(true);
  const [fitOpen, setFitOpen] = useState(false);

  const verdict = derived ? fitVerdict(derived, system.assembly) : null;
  const coating = system.lites.find((l) => l.coating)?.coating;
  const features = [
    coating ? `${coating.kind === "other" ? "coating" : coating.kind} on surface ${coating.surface}` : null,
    system.frit ? `frit on surface ${system.frit.surface}` : null,
  ].filter(Boolean);

  return (
    <div className="flex min-h-full flex-col gap-4 px-7 py-6 xl:px-9">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h2 className={`text-2xl font-semibold tracking-tight ${system.name.trim() ? "text-foreground" : "text-muted"}`}>
            {system.name.trim() || "Untitled glazing"}
          </h2>
          <span className="text-sm text-muted">
            {[constructionSummary(system).replace(" · ", ", "), ...features].join(", ")}
          </span>
        </div>
        <span className="text-[13px] text-muted">
          Drawn to scale. Click + on a surface to add a coating or frit.
        </span>
      </div>

      <div className="flex min-h-[260px] flex-1 flex-col justify-center rounded-xl border border-border-subtle bg-surface px-4 py-3">
        {diagram}
        {picker}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {FIT_QUANTITIES.map(({ key, produced, label }) => {
          const entered = system.assembly[key];
          const made = derived ? luminance(derived.recomputed[produced]) : null;
          const off = derived ? Math.abs(derived.residual[key]) >= 0.02 : false;
          return (
            <div
              key={key}
              className={`rounded-xl border bg-surface px-4 py-3.5 ${off ? "border-warning/60" : "border-border-subtle"}`}
            >
              <p className="text-[13px] text-muted">{label === "Transmittance" ? "Transmittance (VLT)" : label}</p>
              <p
                className={`mt-1 font-mono text-[34px] font-medium leading-[1.1] tracking-tight tabular-nums ${
                  off ? "text-warning" : made === null ? "text-muted" : "text-foreground"
                }`}
              >
                {made === null ? "–" : `${(made * 100).toFixed(1)}%`}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                {assemblyEdited ? "you entered" : "starting estimate"} {(entered * 100).toFixed(1)}%
              </p>
            </div>
          );
        })}
      </div>

      <VerdictLine
        derived={derived}
        verdict={verdict}
        estimated={!assemblyEdited}
        fitOpen={fitOpen}
        onToggleFit={() => setFitOpen(!fitOpen)}
      />

      {fitOpen && derived ? <FitLinePanel derived={derived} /> : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-border-subtle px-4 py-3.5">
          <GlassColorSummary />
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5">
          <DownloadBlock bundle={bundle} blocked={blocked} />
        </div>
      </div>
    </div>
  );
}

function VerdictLine({
  derived,
  verdict,
  estimated,
  fitOpen,
  onToggleFit,
}: {
  derived: DerivedOptics | null;
  verdict: FitVerdict | null;
  estimated: boolean;
  fitOpen: boolean;
  onToggleFit: () => void;
}) {
  if (!derived || !verdict) {
    return (
      <div className="rounded-xl border border-border-subtle px-4 py-3 text-[15px] text-muted">
        Nothing to fit yet. Fix the items listed under the form and the result appears here.
      </div>
    );
  }
  const fitButton = (
    <ActionButton onClick={onToggleFit} active={fitOpen}>
      {fitOpen ? "Done" : "How the fit gets there"}
    </ActionButton>
  );
  if (estimated) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle px-4 py-3">
        <p className="text-[15px] text-muted">
          A starting estimate for this construction. Type your data sheet values in step 1.
        </p>
        {fitButton}
      </div>
    );
  }
  if (verdict.tone === "off") {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-warning/60 bg-warning-soft px-4 py-3 text-warning">
        <div className="flex min-w-0 flex-1 basis-80 items-start gap-2.5">
          <svg viewBox="0 0 18 18" className="mt-0.5 h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
            <path d="M9 2.5 L16.5 15.5 L1.5 15.5 Z" />
            <path d="M9 7.5 V11" />
          </svg>
          <div>
            <p className="text-[15px] font-medium">{verdict.title}.</p>
            <p className="mt-0.5 text-[13px] leading-snug opacity-90">
              Usually the numbers belong to a different construction. Check the lite count, the
              coated surface, and the substrate against the data sheet.
            </p>
          </div>
        </div>
        {fitButton}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/50 bg-success-soft px-4 py-3 text-success">
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <circle cx="9" cy="9" r="7.25" />
          <path d="M5.6 9.3 L8 11.6 L12.4 6.8" />
        </svg>
        <p className="text-[15px] font-medium">{verdict.title}.</p>
      </div>
      {fitButton}
    </div>
  );
}
