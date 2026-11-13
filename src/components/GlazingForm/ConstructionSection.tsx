"use client";

import { Fragment } from "react";
import { SUBSTRATE_LABELS, type SubstrateTint } from "@/engine";
import { SUBSTRATE_ORDER, useAppStore } from "@/lib/store";
import { substrateDisplayHex } from "@/lib/substrateTint";
import { fromDisplay, toDisplay, unitLabel, unitStep } from "@/lib/units";
import { NumberInput, SegmentedControl, Select, Section } from "@/components/ui/fields";
import { GlassColorSummary } from "./GlassColorPanel";

/**
 * A feature shown at its place in the stack, so the card reads as the full
 * exterior-to-interior sandwich. Editing stays in the feature's own card —
 * this row only points there.
 */
type StackFeature = "coating" | "frit";

const FEATURE_STYLE: Record<
  StackFeature,
  { card: string; box: string; square: string; text: string; label: string }
> = {
  coating: {
    card: "card-coating",
    box: "border-accent/50 bg-accent-soft",
    square: "bg-accent",
    text: "text-accent",
    label: "Coating",
  },
  frit: {
    card: "card-frit",
    box: "border-warning/50 bg-warning-soft",
    square: "bg-warning",
    text: "text-warning",
    label: "Frit",
  },
};

function FeatureRow({ kind, detail }: { kind: StackFeature; detail: string }) {
  const style = FEATURE_STYLE[kind];
  return (
    <button
      type="button"
      aria-label={`Go to the ${style.label.toLowerCase()} card`}
      onClick={() =>
        document.getElementById(style.card)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      className={`ml-[78px] flex h-10 w-[calc(100%-78px)] items-center gap-2 rounded-lg border px-3 text-left transition hover:opacity-80 ${style.box}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${style.square}`} aria-hidden />
      <span className={`truncate text-sm font-medium ${style.text}`}>
        {style.label} {detail}
      </span>
      <span className="ml-auto shrink-0 text-[13px] text-muted">edit in step 3</span>
    </button>
  );
}

const unitName = (unit: string) => (unit === "in" ? "inches" : "millimeters");

export function ConstructionSection() {
  // Separate selectors, not one object selector: a fresh object every render
  // would defeat the equality check and re-render on unrelated state changes.
  const system = useAppStore((s) => s.system);
  const unit = useAppStore((s) => s.unit);
  const setLiteCount = useAppStore((s) => s.setLiteCount);
  const updateLite = useAppStore((s) => s.updateLite);
  const setGapWidth = useAppStore((s) => s.setGapWidth);

  const coating = system.lites.find((l) => l.coating)?.coating;
  const frit = system.frit;
  // Coating before frit when both sit on one surface, matching the diagram.
  const featuresOn = (surface: number): StackFeature[] => [
    ...(coating?.surface === surface ? (["coating"] as const) : []),
    ...(frit?.surface === surface ? (["frit"] as const) : []),
  ];
  return (
    <Section
      id="card-construction"
      title={
        <>
          <span className="text-accent">2</span>
          <span className="text-muted"> · </span>
          Construction
        </>
      }
      helpLabel="construction"
      help={
        <p>
          The build-up from the data sheet header: lites and the gaps between them, exterior
          first. The swatch beside each substrate is the color that lite is drawn with on the
          diagram.
        </p>
      }
      action={
        <SegmentedControl
          ariaLabel="Number of lites"
          value={system.lites.length}
          onChange={setLiteCount}
          options={[
            { value: 1, label: "Single", title: "Monolithic lite" },
            { value: 2, label: "Double", title: "Double IGU" },
            { value: 3, label: "Triple", title: "Triple IGU" },
          ]}
        />
      }
    >
      <p className="mb-2 text-xs font-medium tracking-widest text-muted">EXTERIOR</p>
      <div className="space-y-2">
        {system.lites.map((lite, index) => (
          <Fragment key={index}>
            {featuresOn(index * 2 + 1).map((kind) => (
              <FeatureRow key={kind} kind={kind} detail={`on surface ${index * 2 + 1}`} />
            ))}

            <div className="grid grid-cols-[68px_minmax(0,104px)_minmax(0,1fr)_40px] items-center gap-2.5">
              <span className="text-sm font-medium text-foreground">Lite {index + 1}</span>
              <NumberInput
                ariaLabel={`Lite ${index + 1} thickness in ${unitName(unit)}`}
                value={toDisplay(lite.thickness, unit)}
                onChange={(value) => updateLite(index, { thickness: fromDisplay(value, unit) })}
                min={0}
                step={unitStep(unit)}
                suffix={unitLabel(unit)}
              />
              <Select<SubstrateTint>
                ariaLabel={`Lite ${index + 1} substrate`}
                value={lite.substrate}
                onChange={(substrate) => updateLite(index, { substrate })}
                options={SUBSTRATE_ORDER.map((tint) => ({
                  value: tint,
                  label: SUBSTRATE_LABELS[tint],
                }))}
              />
              <span
                aria-hidden
                title="Drawn with this color on the diagram"
                className="h-10 w-10 rounded-lg border border-border-strong"
                style={{ background: substrateDisplayHex(lite.substrate) }}
              />
            </div>

            {featuresOn(index * 2 + 2).map((kind) => (
              <FeatureRow key={kind} kind={kind} detail={`on surface ${index * 2 + 2}`} />
            ))}

            {/* The cavity gets its own slim card between the lites, sunken so
                it reads as the gap rather than part of a pane. */}
            {system.gaps[index] ? (
              <div className="grid grid-cols-[68px_minmax(0,104px)_minmax(0,1fr)_40px] items-center gap-2.5">
                <span className="text-sm leading-tight text-muted">Air space</span>
                <NumberInput
                  ariaLabel={`Air space ${index + 1} width in ${unitName(unit)}`}
                  value={toDisplay(system.gaps[index].width, unit)}
                  onChange={(value) => setGapWidth(index, fromDisplay(value, unit))}
                  min={0}
                  step={unitStep(unit)}
                  suffix={unitLabel(unit)}
                />
              </div>
            ) : null}
          </Fragment>
        ))}

      </div>

      <p className="mt-2 text-xs font-medium tracking-widest text-muted">INTERIOR</p>

      {/* On a desktop the glass color sits in the result pane, beside the
          picture it describes. */}
      <div className="mt-4 border-t border-border-subtle pt-4 lg:hidden">
        <GlassColorSummary />
      </div>
    </Section>
  );
}
