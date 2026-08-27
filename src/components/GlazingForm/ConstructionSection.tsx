"use client";

import { useState } from "react";
import {
  SUBSTRATE_LABELS,
  gray,
  nominalAssemblyHue,
  resolveColorSpec,
  type SubstrateTint,
} from "@/engine";
import { SUBSTRATE_ORDER, useAppStore } from "@/lib/store";
import { fromDisplay, toDisplay, unitLabel, unitStep } from "@/lib/units";
import { ActionButton, Field, NumberInput, SegmentedControl, Select, Section } from "@/components/ui/fields";
import { GlassColorPanel, Swatch } from "./GlassColorPanel";

export function ConstructionSection() {
  // Separate selectors, not one object selector: a fresh object every render
  // would defeat the equality check and re-render on unrelated state changes.
  const system = useAppStore((s) => s.system);
  const unit = useAppStore((s) => s.unit);
  const setLiteCount = useAppStore((s) => s.setLiteCount);
  const updateLite = useAppStore((s) => s.updateLite);
  const setGapWidth = useAppStore((s) => s.setGapWidth);
  const setRollerWave = useAppStore((s) => s.setRollerWave);
  const rollerWave = system.rollerWave;
  const [colorOpen, setColorOpen] = useState(false);

  const coating = system.lites.find((l) => l.coating)?.coating;
  const coatingHue = coating?.reflectedColor ?? gray(1);
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
          <span className="text-accent">1</span>
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
          <div key={index} className="rounded-md border border-border-subtle p-3">
            <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
              <span className="pb-1.5 text-xs font-semibold text-muted">Lite {index + 1}</span>
              <Field label={`Thickness (${unitLabel(unit)})`}>
                <NumberInput
                  value={toDisplay(lite.thickness, unit)}
                  onChange={(value) => updateLite(index, { thickness: fromDisplay(value, unit) })}
                  min={0}
                  step={unitStep(unit)}
                />
              </Field>
              <Field label="Substrate">
                <Select<SubstrateTint>
                  value={lite.substrate}
                  onChange={(substrate) => updateLite(index, { substrate })}
                  options={SUBSTRATE_ORDER.map((tint) => ({
                    value: tint,
                    label: SUBSTRATE_LABELS[tint],
                  }))}
                />
              </Field>
            </div>

            {system.gaps[index] ? (
              <div className="mt-3 flex items-end gap-3 border-t border-border-subtle pt-3">
                <span className="pb-1.5 text-xs text-muted">Air space</span>
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
          </div>
        ))}
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
        </p>

        {colorOpen ? (
          <div className="mt-3">
            <GlassColorPanel />
          </div>
        ) : null}
      </div>

      <div className="mt-3 border-t border-border-subtle pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="text-xs font-medium text-muted">Roller wave</span>
          <SegmentedControl
            ariaLabel="Roller wave depth"
            value={rollerWave?.depth ?? "off"}
            onChange={(depth) =>
              setRollerWave(depth === "off" ? undefined : { depth })
            }
            options={[
              { value: "off", label: "Off" },
              { value: "subtle", label: "Subtle" },
              { value: "typical", label: "Typical" },
              { value: "strong", label: "Strong" },
            ]}
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted/80">
          Real heat-treated glass carries a faint ripple from the tempering rollers; it is what
          makes reflections read as glass. Ships as a normal map with the export.
        </p>
      </div>
    </Section>
  );
}
