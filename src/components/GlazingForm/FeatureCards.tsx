"use client";

import { useState, type ReactNode } from "react";
import {
  luminance,
  type CoatingKind,
  type DerivedOptics,
  type SurfaceNumber,
} from "@/engine";
import { defaultFrit, useAppStore } from "@/lib/store";
import { surfaceOptions } from "@/lib/surfaces";
import { Field, Select } from "@/components/ui/fields";
import { CoatingOverridesPanel } from "./CoatingPanel";
import { FritControls } from "./FritSection";

/**
 * Coating and frit are the same kind of thing — a feature on one numbered
 * surface — so their cards share one anatomy: colored square matching the
 * diagram tag, type/pattern beside a surface dropdown, Remove in the corner.
 * Absent, each collapses to a dashed add-row so the option stays visible.
 */

const COATING_KINDS: { value: CoatingKind; label: string }[] = [
  { value: "low-e", label: "Low-e" },
  { value: "reflective", label: "Reflective" },
  { value: "other", label: "Other" },
];

export function CoatingCard({ derived }: { derived: DerivedOptics | null }) {
  const system = useAppStore((s) => s.system);
  const updateLite = useAppStore((s) => s.updateLite);
  const setCoating = useAppStore((s) => s.setCoating);
  const moveCoatingToSurface = useAppStore((s) => s.moveCoatingToSurface);
  const [overridesOpen, setOverridesOpen] = useState(false);

  const coatedIndex = system.lites.findIndex((l) => l.coating);
  const coating = coatedIndex >= 0 ? system.lites[coatedIndex].coating : undefined;

  if (!coating) {
    return (
      <AddCard
        id="card-coating"
        title="Add a coating"
        blurb="Most performance glazing is coated. Leave it off only for plain tinted or clear glass."
        onAdd={() => moveCoatingToSurface(system.lites.length > 1 ? 2 : 1)}
      />
    );
  }

  const fitted = derived?.coating;
  const overrideCount = coating.overrides ? Object.keys(coating.overrides).length : 0;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <FeatureCardShell
      id="card-coating"
      title="Coating"
      squareClass="bg-accent"
      borderClass="border-accent/50"
      onRemove={() => setCoating(coatedIndex, undefined)}
    >
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label="Type">
          <Select<CoatingKind>
            value={coating.kind}
            onChange={(kind) => updateLite(coatedIndex, { coating: { ...coating, kind } })}
            options={COATING_KINDS}
          />
        </Field>
        <Field label="Surface">
          <Select
            value={String(coating.surface)}
            onChange={(value) => moveCoatingToSurface(Number(value) as SurfaceNumber)}
            options={surfaceOptions(system.lites.length).map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
          />
        </Field>
      </div>

      <p className="mt-2 text-xs leading-snug text-muted">
        Says where the reflection asymmetry lives; low-e is usually #2. Only one coating is
        fitted at a time, since the three measured numbers can only pin down one coating&apos;s
        unknowns. A product with a second coating still exports correctly: the numbers describe
        the finished assembly either way.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border-subtle pt-2.5">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
          <span className="font-medium">Fitted from your numbers</span>
          {fitted ? (
            <>
              <span>
                Transmits{" "}
                <span className="font-mono text-foreground">{pct(luminance(fitted.transmission))}</span>
              </span>
              <span>
                Reflects, out{" "}
                <span className="font-mono text-foreground">{pct(luminance(fitted.reflectanceExt))}</span>
              </span>
              <span>
                Reflects, in{" "}
                <span className="font-mono text-foreground">{pct(luminance(fitted.reflectanceInt))}</span>
              </span>
            </>
          ) : (
            <span>waiting on a solvable construction</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {overrideCount ? (
            <span className="text-[11px] text-muted/80">{overrideCount} overridden</span>
          ) : null}
          <button
            type="button"
            onClick={() => setOverridesOpen(!overridesOpen)}
            className="text-xs font-medium text-accent transition hover:opacity-80"
          >
            {overridesOpen ? "Done" : "Override…"}
          </button>
        </div>
      </div>

      {overridesOpen ? (
        <div className="mt-3">
          <CoatingOverridesPanel
            coating={coating}
            derived={derived}
            onChange={(next) => updateLite(coatedIndex, { coating: next })}
          />
        </div>
      ) : null}
    </FeatureCardShell>
  );
}

export function FritCard() {
  const frit = useAppStore((s) => s.system.frit);
  const liteCount = useAppStore((s) => s.system.lites.length);
  const setFrit = useAppStore((s) => s.setFrit);

  if (!frit) {
    return (
      <AddCard
        id="card-frit"
        title="Add frit"
        blurb="Ceramic enamel fused to one surface: dots, lines, or your own pattern file."
        onAdd={() =>
          setFrit(defaultFrit(liteCount > 1 ? 2 : 1, { r: 0.9, g: 0.9, b: 0.88 }))
        }
      />
    );
  }

  return (
    <FeatureCardShell
      id="card-frit"
      title="Frit"
      squareClass="bg-warning"
      borderClass="border-border-subtle"
      onRemove={() => setFrit(undefined)}
    >
      <FritControls />
    </FeatureCardShell>
  );
}

function FeatureCardShell({
  id,
  title,
  squareClass,
  borderClass,
  onRemove,
  children,
}: {
  id: string;
  title: string;
  squareClass: string;
  borderClass: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-24 rounded-lg border bg-surface p-4 ${borderClass}`}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-sm ${squareClass}`} aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <span className="text-[11px] text-muted/80">shown on the diagram</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-medium text-danger transition hover:opacity-80"
        >
          Remove
        </button>
      </header>
      {children}
    </section>
  );
}

function AddCard({
  id,
  title,
  blurb,
  onAdd,
}: {
  id: string;
  title: string;
  blurb: string;
  onAdd: () => void;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-lg border border-dashed border-border-strong/60 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{blurb}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-border-strong"
        >
          Add
        </button>
      </div>
    </section>
  );
}
