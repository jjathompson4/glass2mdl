"use client";

import { useEffect, useRef, useState } from "react";
import {
  SUBSTRATE_LABELS,
  type DerivedOptics,
  type SurfaceNumber,
} from "@/engine";
import { defaultFrit, useAppStore } from "@/lib/store";
import { fitVerdict, type FitVerdict } from "./fitVerdict";
import { MiniSection, SurfaceDiagram, type DiagramFeature } from "./SurfaceDiagram";

/**
 * The cross-section stays on screen while the cards scroll, so the drawing is
 * both the map and the dashboard: feature tags jump to their cards, bare
 * surfaces grow a + to add one, and the three numbers plus the fit verdict
 * are always in view. Scrolled past, a one-line bar carrying the same
 * information takes over.
 *
 * The full panel sits in normal flow and the bar is a fixed overlay — an
 * overlay never changes the document's height, so appearing and disappearing
 * can't move the scroll position. (An earlier sticky panel that swapped
 * between the two heights fought the browser's scroll anchoring and made
 * scrolling snap back.)
 */
export function DiagramPanel({ derived }: { derived: DerivedOptics | null }) {
  const system = useAppStore((s) => s.system);
  const moveCoatingToSurface = useAppStore((s) => s.moveCoatingToSurface);
  const setFrit = useAppStore((s) => s.setFrit);

  const [condensed, setCondensed] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<SurfaceNumber | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The bar takes over once the full panel's strip has left the viewport.
  useEffect(() => {
    const onScroll = () => {
      const panel = panelRef.current;
      if (!panel) return;
      setCondensed(panel.getBoundingClientRect().bottom < 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const coating = system.lites.find((l) => l.coating)?.coating;
  const frit = system.frit;
  const canAddCoating = !coating;
  const canAddFrit = !frit;
  const verdict = derived ? fitVerdict(derived, system.assembly) : null;

  const scrollToCard = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpToFeature = (feature: DiagramFeature) => {
    scrollToCard(feature === "coating" ? "card-coating" : "card-frit");
  };

  const addCoating = (surface: SurfaceNumber) => {
    moveCoatingToSurface(surface);
    setPendingAdd(null);
    scrollToCard("card-coating");
  };

  const addFrit = (surface: SurfaceNumber) => {
    setFrit(defaultFrit(surface, { r: 0.9, g: 0.9, b: 0.88 }));
    setPendingAdd(null);
    scrollToCard("card-frit");
  };

  const handleAddAt = (surface: SurfaceNumber) => {
    // With only one kind of feature left to add there is nothing to ask.
    if (canAddCoating && !canAddFrit) return addCoating(surface);
    if (canAddFrit && !canAddCoating) return addFrit(surface);
    setPendingAdd(surface);
  };

  return (
    <>
      <div ref={panelRef} className="border-b border-border-subtle bg-surface">
        <div className="mx-auto max-w-[820px] px-5 py-2.5">
          <SurfaceDiagram
            lites={system.lites}
            gaps={system.gaps}
            coatingSurface={coating?.surface}
            fritSurface={frit?.surface}
            onFeatureClick={jumpToFeature}
            onAddAt={canAddCoating || canAddFrit ? handleAddAt : undefined}
          />

              {pendingAdd !== null ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-xs">
                  <span className="font-medium text-foreground">
                    Add to surface #{pendingAdd}:
                  </span>
                  {canAddCoating ? (
                    <button
                      type="button"
                      onClick={() => addCoating(pendingAdd)}
                      className="rounded-md border border-accent bg-surface px-2.5 py-1 font-medium text-accent transition hover:bg-accent hover:text-white"
                    >
                      Coating
                    </button>
                  ) : null}
                  {canAddFrit ? (
                    <button
                      type="button"
                      onClick={() => addFrit(pendingAdd)}
                      className="rounded-md border border-warning bg-surface px-2.5 py-1 font-medium text-warning transition hover:bg-warning-soft"
                    >
                      Frit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPendingAdd(null)}
                    className="ml-auto rounded-md px-2 py-1 text-muted transition hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border-subtle pt-2">
            <NumberStrip />
            <VerdictChip verdict={verdict} />
          </div>
        </div>
      </div>

      {condensed ? (
        <div className="fixed inset-x-0 top-0 z-30 border-b border-border-subtle bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.12)]">
          <div className="mx-auto max-w-[820px] px-5 py-2">
            <CondensedBar verdict={verdict} onJump={jumpToFeature} />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** "6 / 12 / 6 mm · low-iron" — the build-up in one phrase. */
function constructionSummary(system: {
  lites: { thickness: number; substrate: string }[];
  gaps: { width: number }[];
}): string {
  const spans: number[] = [];
  system.lites.forEach((lite, i) => {
    spans.push(lite.thickness);
    if (system.gaps[i]) spans.push(system.gaps[i].width);
  });
  const substrates = new Set(system.lites.map((l) => l.substrate));
  const tint =
    substrates.size === 1
      ? SUBSTRATE_LABELS[system.lites[0].substrate as keyof typeof SUBSTRATE_LABELS].toLowerCase()
      : "mixed substrates";
  return `${spans.join(" / ")} mm · ${tint}`;
}

function NumberStrip() {
  const assembly = useAppStore((s) => s.system.assembly);
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
      <span>
        VLT <span className="font-mono text-foreground">{pct(assembly.tvis)}</span>
      </span>
      <span>
        Reflect ext <span className="font-mono text-foreground">{pct(assembly.rvisExt)}</span>
      </span>
      <span>
        Reflect int <span className="font-mono text-foreground">{pct(assembly.rvisInt)}</span>
      </span>
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: FitVerdict | null }) {
  if (!verdict) return null;

  if (verdict.tone === "exact") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <circle cx="6" cy="6" r="4.75" />
          <path d="M3.8 6.2 L5.3 7.7 L8.2 4.6" />
        </svg>
        {verdict.chip}
      </span>
    );
  }
  if (verdict.tone === "close") {
    return <span className="text-xs text-muted">{verdict.chip}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path d="M6 1.5 L11 10.5 L1 10.5 Z" />
        <line x1="6" y1="4.5" x2="6" y2="7.5" />
      </svg>
      {verdict.chip}
    </span>
  );
}

function CondensedBar({
  verdict,
  onJump,
}: {
  verdict: FitVerdict | null;
  onJump: (feature: DiagramFeature) => void;
}) {
  const system = useAppStore((s) => s.system);
  const coating = system.lites.find((l) => l.coating)?.coating;
  const frit = system.frit;

  return (
    <div className="flex items-center gap-3.5">
      <MiniSection
        lites={system.lites}
        gaps={system.gaps}
        coatingSurface={coating?.surface}
        fritSurface={frit?.surface}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground">
            {system.name}
          </span>
          <span className="hidden shrink-0 text-[11px] text-muted sm:inline">
            {constructionSummary(system)}
          </span>
        </div>
        {coating || frit ? (
          <div className="mt-0.5 flex gap-1.5">
            {coating ? (
              <button
                type="button"
                onClick={() => onJump("coating")}
                className="rounded-full border border-accent bg-accent-soft px-2 py-px text-[10px] font-semibold text-accent transition hover:opacity-80"
              >
                coating · #{coating.surface}
              </button>
            ) : null}
            {frit ? (
              <button
                type="button"
                onClick={() => onJump("frit")}
                className="rounded-full border border-warning bg-warning-soft px-2 py-px text-[10px] font-semibold text-warning transition hover:opacity-80"
              >
                frit · #{frit.surface}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <NumberStrip />
        <VerdictChip verdict={verdict} />
      </div>
    </div>
  );
}
