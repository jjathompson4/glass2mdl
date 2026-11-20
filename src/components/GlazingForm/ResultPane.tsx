"use client";

import { useState } from "react";
import type { DerivedOptics, ExportBundle } from "@/engine";
import { useAppStore } from "@/lib/store";
import { ActionButton } from "@/components/ui/fields";
import { constructionSummary, useDiagramControls } from "./DiagramPanel";
import { FitLinePanel } from "./FitLinePanel";
import { GlassColorSummary } from "./GlassColorPanel";
import { DownloadBlock } from "./ResultSection";
import { fitVerdict, type FitVerdict } from "./fitVerdict";
import { LightDiagram } from "./LightDiagram";

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
  const { picker, controls } = useDiagramControls(true);
  // Open by default: the fit check is the proof the numbers were met, so it
  // should not need finding. It can still be folded away.
  const [fitOpen, setFitOpen] = useState(true);
  // The light layer is on by default; off leaves the plain builder.
  const [light, setLight] = useState(true);
  const { onAddLite, ...diagramProps } = controls;

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
      </div>

      <div className="flex min-h-[300px] flex-1 flex-col rounded-xl border border-border-subtle bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border-subtle px-4 py-2">
          <span className="text-[13px] text-muted">
            Drawn to scale. Click a surface number to add a coating or frit.
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={light}
            onClick={() => setLight(!light)}
            className="flex h-9 items-center gap-2.5 text-sm text-foreground"
          >
            Light transmission
            <span className={`relative h-[22px] w-[38px] rounded-full transition ${light ? "bg-accent" : "bg-border-strong"}`}>
              <span
                className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${light ? "left-[19px]" : "left-[3px]"}`}
              />
            </span>
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center px-3 py-2">
          <LightDiagram
            {...diagramProps}
            derived={derived}
            entered={system.assembly}
            showEntered={assemblyEdited}
            light={light}
          />
          {picker}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle px-4 py-2">
          {light && derived ? (
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <span className="h-1 w-6 rounded-full bg-light" aria-hidden />
              Orange shows where the light goes: through the glass, or reflected back.
            </span>
          ) : (
            <span className="text-[13px] text-muted">
              {derived ? "Light transmission is hidden." : "Nothing to draw the light from yet."}
            </span>
          )}
          {onAddLite ? (
            <button
              type="button"
              onClick={onAddLite}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 text-[13px] text-foreground transition hover:border-accent hover:text-accent"
            >
              <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path d="M7 2 V12 M2 7 H12" />
              </svg>
              Add lite
            </button>
          ) : null}
        </div>
      </div>

      <VerdictLine derived={derived} verdict={verdict} estimated={!assemblyEdited} />

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-border-subtle px-4 py-3.5">
          <GlassColorSummary />
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5">
          <DownloadBlock bundle={bundle} blocked={blocked} />
        </div>
      </div>

      {derived ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[17px] font-semibold text-foreground">Fit check</h3>
            <ActionButton onClick={() => setFitOpen(!fitOpen)}>
              {fitOpen ? "Hide fit check" : "Show fit check"}
            </ActionButton>
          </div>
          {fitOpen ? <FitLinePanel derived={derived} cardsOnly /> : null}
        </div>
      ) : null}
    </div>
  );
}

function VerdictLine({
  derived,
  verdict,
  estimated,
}: {
  derived: DerivedOptics | null;
  verdict: FitVerdict | null;
  estimated: boolean;
}) {
  if (!derived || !verdict) {
    return (
      <div className="rounded-xl border border-border-subtle px-4 py-3 text-[15px] text-muted">
        Nothing to fit yet. Fix the items listed under the form and the result appears here.
      </div>
    );
  }
  if (estimated) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle px-4 py-3">
        <p className="text-[15px] text-muted">
          A starting estimate for this construction. Type your data sheet values in step 1.
        </p>
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
    </div>
  );
}
