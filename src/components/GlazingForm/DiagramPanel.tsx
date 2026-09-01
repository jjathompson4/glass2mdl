"use client";

import { useEffect, useRef, useState } from "react";
import {
  SUBSTRATE_LABELS,
  type DerivedOptics,
  type SurfaceNumber,
} from "@/engine";
import { defaultFrit, defaultSpandrel, useAppStore } from "@/lib/store";
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
  const setSpandrel = useAppStore((s) => s.setSpandrel);
  const setLiteCount = useAppStore((s) => s.setLiteCount);
  const assemblyEdited = useAppStore((s) => s.assemblyEdited);

  const [condensed, setCondensed] = useState(false);
  const [barTop, setBarTop] = useState(0);
  const [pendingAdd, setPendingAdd] = useState<SurfaceNumber | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The bar takes over once the full panel's strip has slid under the sticky
  // site header, and pins itself directly beneath that header.
  useEffect(() => {
    const onScroll = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const headerBottom =
        document.getElementById("site-header")?.getBoundingClientRect().bottom ?? 0;
      setBarTop(Math.max(0, headerBottom));
      setCondensed(panel.getBoundingClientRect().bottom < headerBottom + 8);
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
  const spandrel = system.spandrel;
  const canAddCoating = !coating;
  // Frit and a spandrel finish exclude each other.
  const canAddFrit = !frit && !spandrel;
  const canAddFloodCoat = !frit && !spandrel;
  const verdict = derived ? fitVerdict(derived, system.assembly) : null;

  const scrollToCard = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpToFeature = (feature: DiagramFeature) => {
    scrollToCard(
      feature === "coating" ? "card-coating" : feature === "frit" ? "card-frit" : "card-spandrel",
    );
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

  const addFloodCoat = (surface: SurfaceNumber) => {
    setSpandrel(defaultSpandrel("flood-coat", system.lites.length, surface));
    setPendingAdd(null);
    scrollToCard("card-spandrel");
  };

  // What the + on a given surface can add: a flood coat only goes on a back
  // face (even number), the others anywhere.
  const optionsAt = (surface: SurfaceNumber) => [
    ...(canAddCoating ? [{ label: "Coating", add: addCoating, style: "border-accent text-accent hover:bg-accent hover:text-white" }] : []),
    ...(canAddFrit ? [{ label: "Frit", add: addFrit, style: "border-warning text-warning hover:bg-warning-soft" }] : []),
    ...(canAddFloodCoat && surface % 2 === 0
      ? [{ label: "Flood coat (spandrel)", add: addFloodCoat, style: "border-spandrel text-spandrel hover:bg-spandrel-soft" }]
      : []),
  ];

  const handleAddAt = (surface: SurfaceNumber) => {
    // With only one kind of feature left to add there is nothing to ask.
    const options = optionsAt(surface);
    if (options.length === 1) return options[0].add(surface);
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
            spandrel={spandrel}
            onFeatureClick={jumpToFeature}
            onAddAt={canAddCoating || canAddFrit || canAddFloodCoat ? handleAddAt : undefined}
            onAddLite={
              system.lites.length < 3
                ? () => setLiteCount(system.lites.length + 1)
                : undefined
            }
          />

              {pendingAdd !== null ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-xs">
                  <span className="font-medium text-foreground">
                    Add to surface #{pendingAdd}:
                  </span>
                  {optionsAt(pendingAdd).map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => option.add(pendingAdd)}
                      className={`rounded-md border bg-surface px-2.5 py-1 font-medium transition ${option.style}`}
                    >
                      {option.label}
                    </button>
                  ))}
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
            <NumberStrip muted={!assemblyEdited} />
            <VerdictChip verdict={verdict} estimated={!assemblyEdited} />
          </div>
        </div>
      </div>

      {condensed ? (
        <div
          className="fixed inset-x-0 z-30 border-b border-border-subtle bg-surface shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
          style={{ top: barTop }}
        >
          <div className="mx-auto max-w-[820px] px-5 py-2">
            <CondensedBar verdict={verdict} estimated={!assemblyEdited} onJump={jumpToFeature} />
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

function NumberStrip({ muted = false }: { muted?: boolean }) {
  const assembly = useAppStore((s) => s.system.assembly);
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  // Muted until the user types a number of their own: seeded defaults are a
  // sensible starting estimate, not data anyone entered.
  const value = muted ? "font-mono text-muted" : "font-mono text-foreground";
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
      <span>
        VLT <span className={value}>{pct(assembly.tvis)}</span>
      </span>
      <span>
        Reflect ext <span className={value}>{pct(assembly.rvisExt)}</span>
      </span>
      <span>
        Reflect int <span className={value}>{pct(assembly.rvisInt)}</span>
      </span>
    </div>
  );
}

export function VerdictChip({
  verdict,
  estimated = false,
}: {
  verdict: FitVerdict | null;
  estimated?: boolean;
}) {
  if (estimated) {
    return <span className="text-xs text-muted/80">estimated for this construction</span>;
  }
  if (!verdict) return null;

  // The full chip is desktop-length prose; phones get chipCompact so the
  // verdict stays one line in the pinned bar's narrow column.
  const chipText = (
    <>
      <span className="hidden sm:inline">{verdict.chip}</span>
      <span className="whitespace-nowrap sm:hidden">{verdict.chipCompact}</span>
    </>
  );

  if (verdict.tone === "exact") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <circle cx="6" cy="6" r="4.75" />
          <path d="M3.8 6.2 L5.3 7.7 L8.2 4.6" />
        </svg>
        {chipText}
      </span>
    );
  }
  if (verdict.tone === "close") {
    return <span className="text-xs text-muted">{chipText}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path d="M6 1.5 L11 10.5 L1 10.5 Z" />
        <line x1="6" y1="4.5" x2="6" y2="7.5" />
      </svg>
      {chipText}
    </span>
  );
}

function CondensedBar({
  verdict,
  estimated,
  onJump,
}: {
  verdict: FitVerdict | null;
  estimated: boolean;
  onJump: (feature: DiagramFeature) => void;
}) {
  const system = useAppStore((s) => s.system);
  const coating = system.lites.find((l) => l.coating)?.coating;
  const frit = system.frit;
  const spandrel = system.spandrel;

  return (
    <div className="flex items-center gap-3.5">
      <MiniSection
        lites={system.lites}
        gaps={system.gaps}
        coatingSurface={coating?.surface}
        fritSurface={frit?.surface}
        spandrel={spandrel}
      />

      {/* On phones the name and number strip give way, and once a real fit
          verdict exists it takes the whole line: a 335px row cannot hold the
          summary, the tags, AND the verdict, and the verdict is the one thing
          the pinned bar must say. */}
      <div className={verdict && !estimated ? "hidden min-w-0 flex-1 sm:block" : "min-w-0 flex-1"}>
        <div className="flex items-baseline gap-2">
          <span className="hidden truncate text-[13px] font-semibold text-foreground sm:inline">
            {system.name}
          </span>
          <span className="min-w-0 truncate text-[11px] text-muted sm:shrink-0">
            {constructionSummary(system)}
          </span>
        </div>
        {coating || frit || spandrel ? (
          <div className="mt-0.5 flex gap-1.5">
            {coating ? (
              <button
                type="button"
                onClick={() => onJump("coating")}
                className="whitespace-nowrap rounded-full border border-accent bg-accent-soft px-2 py-px text-[10px] font-semibold text-accent transition hover:opacity-80"
              >
                coating · #{coating.surface}
              </button>
            ) : null}
            {frit ? (
              <button
                type="button"
                onClick={() => onJump("frit")}
                className="whitespace-nowrap rounded-full border border-warning bg-warning-soft px-2 py-px text-[10px] font-semibold text-warning transition hover:opacity-80"
              >
                frit · #{frit.surface}
              </button>
            ) : null}
            {spandrel ? (
              <button
                type="button"
                onClick={() => onJump("spandrel")}
                className="whitespace-nowrap rounded-full border border-spandrel bg-spandrel-soft px-2 py-px text-[10px] font-semibold text-spandrel transition hover:opacity-80"
              >
                {spandrel.kind === "flood-coat" ? `flood coat · #${spandrel.surface}` : "back pan"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col items-end gap-0.5 sm:shrink-0">
        <div className="hidden sm:block">
          <NumberStrip muted={estimated} />
        </div>
        {/* "estimated for this construction" annotates the number strip, so it
            hides with it; a real fit verdict stands on its own. */}
        <div className={estimated ? "hidden sm:block" : undefined}>
          <VerdictChip verdict={verdict} estimated={estimated} />
        </div>
      </div>
    </div>
  );
}
