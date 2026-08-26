"use client";

import type { ExportMode } from "@/engine";
import { useAppStore } from "@/lib/store";
import { Field, Section, StepTitle, TextInput } from "@/components/ui/fields";

const MODES: { value: ExportMode; label: string; blurb: string }[] = [
  {
    value: "planar",
    label: "Flat planes",
    blurb: "Each opening is a single plane with no thickness. One material for the whole assembly.",
  },
  {
    value: "volumetric",
    label: "Solid lites",
    blurb: "Each lite is a real solid with its own material; reflections stack the way real IGUs do.",
  },
];

/**
 * The export target comes first because it frames every later choice — the
 * question is about the user's Max scene, not about file formats.
 */
export function TargetSection() {
  const name = useAppStore((s) => s.system.name);
  const mode = useAppStore((s) => s.mode);
  const setName = useAppStore((s) => s.setName);
  const setMode = useAppStore((s) => s.setMode);

  return (
    <Section
      title={<StepTitle n={1}>What are you making?</StepTitle>}
      description="How is the glazing modeled in your 3ds Max scene? This decides everything the tool generates."
    >
      <div className="grid grid-cols-2 gap-3">
        {MODES.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={selected}
              className={`rounded-md border p-3.5 text-left transition ${
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-border-subtle hover:border-border-strong"
              }`}
            >
              <ModeGlyph mode={option.value} active={selected} />
              <p className={`mt-1.5 text-[13px] font-semibold ${selected ? "text-accent" : "text-muted"}`}>
                {option.label}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{option.blurb}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-3.5">
        <Field label="Product name" hint="Becomes the material and file names.">
          <TextInput value={name} onChange={setName} placeholder="e.g. Solarban 60 on clear" />
        </Field>
      </div>
    </Section>
  );
}

/** Small pictogram: one surface versus stacked solids. */
function ModeGlyph({ mode, active }: { mode: ExportMode; active: boolean }) {
  const stroke = active ? "var(--accent)" : "var(--border-strong)";
  return (
    <svg viewBox="0 0 48 20" className="h-5 w-12" aria-hidden>
      {mode === "planar" ? (
        <line x1={24} y1={2} x2={24} y2={18} stroke={stroke} strokeWidth={2.5} />
      ) : (
        <>
          <rect x={14} y={2} width={5} height={16} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={1.5} />
          <rect x={29} y={2} width={5} height={16} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}
