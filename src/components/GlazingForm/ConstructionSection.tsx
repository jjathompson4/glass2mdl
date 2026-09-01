"use client";

import { Fragment, useState } from "react";
import {
  SUBSTRATE_LABELS,
  gray,
  nominalAssemblyHue,
  resolveColorSpec,
  type SubstrateTint,
} from "@/engine";
import { SUBSTRATE_ORDER, useAppStore } from "@/lib/store";
import { substrateDisplayHex } from "@/lib/substrateTint";
import { formatLength, fromDisplay, toDisplay, unitLabel, unitStep } from "@/lib/units";
import { ActionButton, Field, NumberInput, SegmentedControl, Select, Section } from "@/components/ui/fields";
import { GlassColorPanel, Swatch } from "./GlassColorPanel";

/**
 * A feature shown at its place in the stack, so the card reads as the full
 * exterior-to-interior sandwich. Editing stays in the feature's own card —
 * this row only points there.
 */
type StackFeature = "coating" | "frit" | "flood-coat" | "back-pan";

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
  "flood-coat": {
    card: "card-spandrel",
    box: "border-spandrel/50 bg-spandrel-soft",
    square: "bg-spandrel",
    text: "text-spandrel",
    label: "Flood coat",
  },
  "back-pan": {
    card: "card-spandrel",
    box: "border-spandrel/50 bg-spandrel-soft",
    square: "bg-spandrel",
    text: "text-spandrel",
    label: "Back pan",
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
      className={`flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left transition hover:opacity-80 ${style.box}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${style.square}`} aria-hidden />
      <span className={`text-xs font-semibold ${style.text}`}>
        {style.label} · {detail}
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-muted">edit below ↓</span>
    </button>
  );
}

export function ConstructionSection() {
  // Separate selectors, not one object selector: a fresh object every render
  // would defeat the equality check and re-render on unrelated state changes.
  const system = useAppStore((s) => s.system);
  const unit = useAppStore((s) => s.unit);
  const setLiteCount = useAppStore((s) => s.setLiteCount);
  const updateLite = useAppStore((s) => s.updateLite);
  const setGapWidth = useAppStore((s) => s.setGapWidth);
  const [colorOpen, setColorOpen] = useState(false);

  const coating = system.lites.find((l) => l.coating)?.coating;
  const coatingHue = coating?.reflectedColor ?? gray(1);
  const frit = system.frit;
  const spandrel = system.spandrel;
  // Coating before frit when both sit on one surface, matching the diagram.
  const featuresOn = (surface: number): StackFeature[] => [
    ...(coating?.surface === surface ? (["coating"] as const) : []),
    ...(frit?.surface === surface ? (["frit"] as const) : []),
    ...(spandrel?.kind === "flood-coat" && spandrel.surface === surface
      ? (["flood-coat"] as const)
      : []),
  ];
  const adjustedCount = [
    system.assembly.transmittedColor,
    system.assembly.reflectedColorExt,
    system.assembly.reflectedColorInt,
  ].filter((spec) => spec && spec.kind !== "auto").length;

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
      description="The build-up from the data sheet header: lites and the gaps between them."
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
      <div className="space-y-2">
        {system.lites.map((lite, index) => (
          <Fragment key={index}>
            {featuresOn(index * 2 + 1).map((kind) => (
              <FeatureRow key={kind} kind={kind} detail={`#${index * 2 + 1}`} />
            ))}

            <div className="rounded-md border border-border-subtle p-3">
              <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[auto_1fr_1fr]">
                <span className="col-span-2 text-xs font-semibold text-muted sm:col-span-1 sm:pb-1.5">
                  Lite {index + 1}
                </span>
                <Field label={`Thickness (${unitLabel(unit)})`}>
                  <NumberInput
                    value={toDisplay(lite.thickness, unit)}
                    onChange={(value) => updateLite(index, { thickness: fromDisplay(value, unit) })}
                    min={0}
                    step={unitStep(unit)}
                  />
                </Field>
                <Field label="Substrate">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select<SubstrateTint>
                        value={lite.substrate}
                        onChange={(substrate) => updateLite(index, { substrate })}
                        options={SUBSTRATE_ORDER.map((tint) => ({
                          value: tint,
                          label: SUBSTRATE_LABELS[tint],
                        }))}
                      />
                    </div>
                    <span
                      aria-hidden
                      title="Drawn with this color on the diagram"
                      className="h-6 w-6 shrink-0 rounded border border-border-strong"
                      style={{ background: substrateDisplayHex(lite.substrate) }}
                    />
                  </div>
                </Field>
              </div>
            </div>

            {featuresOn(index * 2 + 2).map((kind) => (
              <FeatureRow key={kind} kind={kind} detail={`#${index * 2 + 2}`} />
            ))}

            {/* The cavity gets its own slim card between the lites, sunken so
                it reads as the gap rather than part of a pane. */}
            {system.gaps[index] ? (
              <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
                <span className="text-xs font-semibold text-muted">Air space</span>
                <div className="w-28">
                  <NumberInput
                    value={toDisplay(system.gaps[index].width, unit)}
                    onChange={(value) =>
                      setGapWidth(index, fromDisplay(value, unit))
                    }
                    min={0}
                    step={unitStep(unit)}
                    suffix={unitLabel(unit)}
                  />
                </div>
              </div>
            ) : null}
          </Fragment>
        ))}

        {/* The pan is the last element of the stack: an air cavity, then metal. */}
        {spandrel?.kind === "back-pan" ? (
          <>
            <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
              <span className="text-xs font-semibold text-muted">Air cavity</span>
              <span className="text-xs text-muted">{formatLength(spandrel.cavity, unit)}</span>
            </div>
            <FeatureRow kind="back-pan" detail={spandrel.finish === "metallic" ? "metallic" : "painted"} />
          </>
        ) : null}
      </div>

      {/* The color lives with the construction because the substrate choice is
          what produces it; the swatches show what the current build-up gives. */}
      <div className="mt-3 border-t border-border-subtle pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span className="text-xs font-medium text-muted">Glass color</span>
            <span className="flex items-center">
              <span className="rounded-full border-2 border-surface">
                <Swatch
                  color={resolveColorSpec(system.assembly.transmittedColor, nominalAssemblyHue(system.lites))}
                  size="h-5 w-5"
                />
              </span>
              <span className="-ml-1.5 rounded-full border-2 border-surface">
                <Swatch color={resolveColorSpec(system.assembly.reflectedColorExt, coatingHue)} size="h-5 w-5" />
              </span>
              <span className="-ml-1.5 rounded-full border-2 border-surface">
                <Swatch color={resolveColorSpec(system.assembly.reflectedColorInt, coatingHue)} size="h-5 w-5" />
              </span>
            </span>
            <span className="text-[11px] text-muted/80">
              whole assembly: looking through · reflection, outside · reflection, inside
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {adjustedCount ? (
              <span className="text-[11px] text-muted/80">{adjustedCount} adjusted</span>
            ) : null}
            <ActionButton onClick={() => setColorOpen(!colorOpen)} active={colorOpen}>
              {colorOpen ? "Done" : "Adjust…"}
            </ActionButton>
          </div>
        </div>

        <p className="mt-1.5 text-[11px] leading-snug text-muted/80">
          VLT and the two reflectance values set the brightness; the substrate menu supplies
          a representative hue. If the data sheet lists color data, click Adjust and enter it.
          Measured colors from the LBNL International Glazing Database are coming soon.
          {spandrel
            ? " These describe the glass alone; the Spandrel finish card shows what the panel reads as once the finish sits behind it."
            : null}
        </p>

        {colorOpen ? (
          <div className="mt-3">
            <GlassColorPanel />
          </div>
        ) : null}
      </div>

    </Section>
  );
}
