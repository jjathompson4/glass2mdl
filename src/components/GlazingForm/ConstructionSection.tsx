"use client";

import {
  SUBSTRATE_LABELS,
  type CoatingKind,
  type SubstrateTint,
  type SurfaceNumber,
} from "@/engine";
import { SUBSTRATE_ORDER, useAppStore } from "@/lib/store";
import { surfaceOptions } from "@/lib/surfaces";
import { fromDisplay, toDisplay, unitLabel, unitStep } from "@/lib/units";
import {
  Field,
  NumberInput,
  SegmentedControl,
  Select,
  Section,
  StepTitle,
  Toggle,
} from "@/components/ui/fields";
import { SurfaceDiagram } from "./SurfaceDiagram";

const COATING_KINDS: { value: CoatingKind; label: string }[] = [
  { value: "low-e", label: "Low-e" },
  { value: "reflective", label: "Reflective" },
  { value: "other", label: "Other" },
];

export function ConstructionSection() {
  // Separate selectors, not one object selector: a fresh object every render
  // would defeat the equality check and re-render on unrelated state changes.
  const system = useAppStore((s) => s.system);
  const unit = useAppStore((s) => s.unit);
  const setLiteCount = useAppStore((s) => s.setLiteCount);
  const updateLite = useAppStore((s) => s.updateLite);
  const setGapWidth = useAppStore((s) => s.setGapWidth);
  const setCoating = useAppStore((s) => s.setCoating);
  const moveCoatingToSurface = useAppStore((s) => s.moveCoatingToSurface);

  const coatedIndex = system.lites.findIndex((l) => l.coating);
  const coating = coatedIndex >= 0 ? system.lites[coatedIndex].coating : undefined;

  return (
    <Section
      title={<StepTitle n={2}>Construction</StepTitle>}
      description="The build-up from the cutsheet header: lites, gaps, and where the coating sits."
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
      <SurfaceDiagram
        lites={system.lites}
        gaps={system.gaps}
        coatingSurface={coating?.surface}
        fritSurface={system.frit?.surface}
      />

      <div className="mt-3 space-y-2">
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

      <div className="mt-4 rounded-md border border-border-subtle p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Toggle
            checked={Boolean(coating)}
            label="Coated"
            onChange={(checked) => {
              if (checked) moveCoatingToSurface(system.lites.length > 1 ? 2 : 1);
              else setCoating(Math.max(0, coatedIndex), undefined);
            }}
          />

          {coating ? (
            <div className="flex items-center gap-2">
              <div className="w-36">
                <Select<CoatingKind>
                  value={coating.kind}
                  onChange={(kind) => updateLite(coatedIndex, { coating: { ...coating, kind } })}
                  options={COATING_KINDS}
                />
              </div>
              <span className="text-xs text-muted">on surface</span>
              <div className="w-60">
                <Select
                  value={String(coating.surface)}
                  onChange={(value) => moveCoatingToSurface(Number(value) as SurfaceNumber)}
                  options={surfaceOptions(system.lites.length).map((o) => ({
                    value: String(o.value),
                    label: o.label,
                  }))}
                />
              </div>
            </div>
          ) : null}
        </div>

        {coating ? (
          <p className="mt-2 text-xs leading-snug text-muted">
            Says where the reflection asymmetry lives. Pick the surface from the cutsheet; low-e is
            usually #2, and the diagram above highlights it. Its optical values are worked out for
            you (see Fine-tuning in step 4). Only one coating is fitted at a time, since the three
            measured numbers can only pin down one coating&apos;s unknowns. A product with a second
            coating still exports correctly: the numbers describe the finished assembly either way.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Most performance glazing is coated. Leave this off only for plain tinted or clear glass.
          </p>
        )}
      </div>
    </Section>
  );
}
