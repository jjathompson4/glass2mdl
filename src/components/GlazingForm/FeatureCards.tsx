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
import { ActionButton, Field, Section, Select } from "@/components/ui/fields";
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

function CoatingCard({ derived }: { derived: DerivedOptics | null }) {
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
      titleClass="text-accent"
      borderClass="border-accent/50 bg-accent-soft/40"
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border-subtle pt-2.5">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">Fitted from your numbers</p>
          {fitted ? (
            <p className="mt-0.5 text-sm text-foreground">
              Transmits <span className="font-mono">{pct(luminance(fitted.transmission))}</span>,
              reflects <span className="font-mono">{pct(luminance(fitted.reflectanceExt))}</span> out
              and <span className="font-mono">{pct(luminance(fitted.reflectanceInt))}</span> in
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">waiting on a solvable construction</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {overrideCount ? (
            <span className="text-[13px] text-muted">{overrideCount} overridden</span>
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

function FritCard() {
  const frit = useAppStore((s) => s.system.frit);
  const setFrit = useAppStore((s) => s.setFrit);

  if (!frit) return null;

  return (
    <FeatureCardShell
      id="card-frit"
      title="Frit"
      titleClass="text-warning"
      borderClass="border-warning/50 bg-warning-soft/40"
      onRemove={() => setFrit(undefined)}
    >
      <FritControls />
    </FeatureCardShell>
  );
}

function FeatureCardShell({
  id,
  title,
  titleClass,
  borderClass,
  onRemove,
  children,
}: {
  id: string;
  title: string;
  titleClass: string;
  borderClass: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div id={id} className={`scroll-mt-32 rounded-xl border p-3.5 lg:scroll-mt-4 ${borderClass}`}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className={`text-[15px] font-semibold ${titleClass}`}>{title}</h3>
        <ActionButton onClick={onRemove} danger>
          Remove
        </ActionButton>
      </header>
      {children}
    </div>
  );
}

/**
 * Step 3: one header, a card per feature present, and a dashed button for
 * each feature that could still be added.
 */
export function SurfaceFeaturesSection({ derived }: { derived: DerivedOptics | null }) {
  const system = useAppStore((s) => s.system);
  const setFrit = useAppStore((s) => s.setFrit);
  const moveCoatingToSurface = useAppStore((s) => s.moveCoatingToSurface);

  const hasCoating = system.lites.some((l) => l.coating);
  const hasFrit = Boolean(system.frit);

  const offers: { label: string; onClick: () => void }[] = [];
  if (!hasCoating) {
    offers.push({
      label: "Add coating",
      onClick: () => moveCoatingToSurface(system.lites.length > 1 ? 2 : 1),
    });
  }
  if (!hasFrit) {
    offers.push({
      label: "Add frit",
      onClick: () =>
        setFrit(defaultFrit(system.lites.length > 1 ? 2 : 1, { r: 0.9, g: 0.9, b: 0.88 })),
    });
  }

  return (
    <Section
      id="card-features"
      title={
        <>
          <span className="text-accent">3</span>
          <span className="text-muted"> · </span>
          Surface features
        </>
      }
      helpLabel="surface features"
      help={
        <>
          <p>
            Coating and frit each sit on a numbered surface.
            Most performance glazing is coated. Leave the coating off only for plain tinted or
            clear glass.
          </p>
          <p>
            Coating: the surface decides where the reflection asymmetry lives; low-e is usually
            #2. Only one coating is fitted at a time, since three measured numbers can only
            settle one coating&apos;s unknowns. A product with a second coating still exports
            correctly: the numbers describe the finished assembly either way.
          </p>
          <p>Frit: ceramic enamel fused to one surface, as dots, lines, or your own pattern file.</p>
        </>
      }
    >
      <div className="space-y-3">
        <CoatingCard derived={derived} />
        <FritCard />
        {!hasCoating && !hasFrit ? (
          <p className="text-sm text-muted">Nothing on the glass yet. Most performance glazing has a coating.</p>
        ) : null}
        {offers.length ? (
          <div className="flex flex-wrap gap-2.5">
            {offers.map((offer) => (
              <button
                key={offer.label}
                type="button"
                onClick={offer.onClick}
                className="flex h-10 flex-1 basis-40 items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-sm text-foreground transition hover:border-accent hover:text-accent"
              >
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path d="M7 2 V12 M2 7 H12" />
                </svg>
                {offer.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
