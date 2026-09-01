"use client";

import { useState, type ReactNode } from "react";
import {
  luminance,
  type CoatingKind,
  type DerivedOptics,
  type SurfaceNumber,
} from "@/engine";
import { defaultFrit, defaultSpandrel, useAppStore } from "@/lib/store";
import { surfaceOptions } from "@/lib/surfaces";
import { ActionButton, Field, Select } from "@/components/ui/fields";
import { CoatingOverridesPanel } from "./CoatingPanel";
import { FritControls } from "./FritSection";
import { SpandrelControls } from "./SpandrelSection";

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

  if (!coating) return null;

  const fitted = derived?.coating;
  const overrideCount = coating.overrides ? Object.keys(coating.overrides).length : 0;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <FeatureCardShell
      id="card-coating"
      title="Coating"
      number={3}
      squareClass="bg-accent"
      borderClass="border-accent/50"
      onRemove={() => setCoating(coatedIndex, undefined)}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
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
        Determines where the reflection asymmetry lives; low-e is usually #2. Only one coating is
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
          <ActionButton onClick={() => setOverridesOpen(!overridesOpen)} active={overridesOpen}>
            {overridesOpen ? "Done" : "Override…"}
          </ActionButton>
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
  const setFrit = useAppStore((s) => s.setFrit);

  if (!frit) return null;

  return (
    <FeatureCardShell
      id="card-frit"
      title="Frit"
      number={3}
      squareClass="bg-warning"
      borderClass="border-border-subtle"
      onRemove={() => setFrit(undefined)}
    >
      <FritControls />
    </FeatureCardShell>
  );
}

export function SpandrelCard({ derived }: { derived: DerivedOptics | null }) {
  const spandrel = useAppStore((s) => s.system.spandrel);
  const setSpandrel = useAppStore((s) => s.setSpandrel);

  if (!spandrel) return null;

  return (
    <FeatureCardShell
      id="card-spandrel"
      title="Spandrel finish"
      number={3}
      squareClass="bg-spandrel"
      borderClass="border-spandrel/50"
      onRemove={() => setSpandrel(undefined)}
    >
      <p className="mb-3 text-xs leading-snug text-muted">
        Same glass, made opaque: a flood coat painted on the back of a lite, or a metal pan behind
        an air cavity. The data sheet values above still describe the glass; only the finish is
        new.
      </p>
      <SpandrelControls derived={derived} />
    </FeatureCardShell>
  );
}

function FeatureCardShell({
  id,
  title,
  number,
  squareClass,
  borderClass,
  onRemove,
  children,
}: {
  id: string;
  title: string;
  number: number;
  squareClass: string;
  borderClass: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-32 rounded-lg border bg-surface p-4 ${borderClass}`}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-sm ${squareClass}`} aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">
            <span className="text-accent">{number}</span>
            <span className="text-muted"> · </span>
            {title}
          </h2>
          <span className="text-[11px] text-muted/80">shown on the diagram</span>
        </div>
        <ActionButton onClick={onRemove} danger>
          Remove
        </ActionButton>
      </header>
      {children}
    </section>
  );
}

export function SurfaceFeaturesGhost() {
  const system = useAppStore((s) => s.system);
  const setFrit = useAppStore((s) => s.setFrit);
  const setSpandrel = useAppStore((s) => s.setSpandrel);
  const moveCoatingToSurface = useAppStore((s) => s.moveCoatingToSurface);

  const hasCoating = system.lites.some((l) => l.coating);
  const hasFrit = Boolean(system.frit);
  const hasSpandrel = Boolean(system.spandrel);

  const addCoating = () => moveCoatingToSurface(system.lites.length > 1 ? 2 : 1);
  const addFrit = () =>
    setFrit(defaultFrit(system.lites.length > 1 ? 2 : 1, { r: 0.9, g: 0.9, b: 0.88 }));
  const addSpandrel = () => setSpandrel(defaultSpandrel("flood-coat", system.lites.length));

  // Frit and a spandrel finish exclude each other: the finish already covers
  // the whole panel. So the offer list shrinks as features are added.
  const offers: { label: string; blurb: string; onClick: () => void }[] = [];
  if (!hasCoating) {
    offers.push({
      label: "Add coating",
      blurb: "Most performance glazing is coated. Leave it off only for plain tinted or clear glass.",
      onClick: addCoating,
    });
  }
  if (!hasFrit && !hasSpandrel) {
    offers.push({
      label: "Add frit",
      blurb: "Frit: ceramic enamel fused to one surface, as dots, lines, or your own pattern file.",
      onClick: addFrit,
    });
    offers.push({
      label: "Make it a spandrel",
      blurb: "Spandrel: the same glass with an opaque flood coat or a back pan behind it.",
      onClick: addSpandrel,
    });
  }
  if (!offers.length) return null;

  // No feature yet: this ghost IS card 3. Otherwise a real card carries the
  // number and this shrinks to a one-line add row.
  if (!hasCoating && !hasFrit && !hasSpandrel) {
    return (
      <section className="scroll-mt-32 rounded-lg border border-dashed border-border-strong/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              <span className="text-accent">3</span>
              <span className="text-muted"> · </span>
              Surface features
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Coating and frit sit on a numbered surface; a spandrel finish sits behind the
              glass. Most performance glazing has a coating.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {offers.map((offer) => (
              <GhostButton key={offer.label} label={offer.label} onClick={offer.onClick} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="scroll-mt-32 rounded-lg border border-dashed border-border-strong/60 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">{offers[0].blurb}</p>
        <div className="flex shrink-0 flex-wrap gap-2">
          {offers.map((offer) => (
            <GhostButton key={offer.label} label={offer.label} onClick={offer.onClick} />
          ))}
        </div>
      </div>
    </section>
  );
}

function GhostButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-border-strong"
    >
      {label}
    </button>
  );
}
