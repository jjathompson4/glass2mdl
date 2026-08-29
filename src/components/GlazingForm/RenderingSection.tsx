"use client";

import { type ExportMode } from "@/engine";
import { useAppStore } from "@/lib/store";
import { SegmentedControl, Section } from "@/components/ui/fields";

const MODES: { value: ExportMode; label: string; blurb: string }[] = [
  {
    value: "planar",
    label: "Planar geometry",
    blurb: "Each opening is a single plane with no thickness.",
  },
  {
    value: "volumetric",
    label: "Solid lites geometry",
    blurb: "Each lite is a real solid; reflections stack like real IGUs.",
  },
];

/** Small pictogram: one surface versus stacked solids. */
function ModeGlyph({ mode, active }: { mode: ExportMode; active: boolean }) {
  const stroke = active ? "var(--accent)" : "var(--border-strong)";
  return (
    <svg viewBox="0 0 34 20" className="h-5 w-8 shrink-0" aria-hidden>
      {mode === "planar" ? (
        <line x1={17} y1={2} x2={17} y2={18} stroke={stroke} strokeWidth={2.5} />
      ) : (
        <>
          <rect x={8} y={2} width={5} height={16} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={1.5} />
          <rect x={21} y={2} width={5} height={16} fill={stroke} fillOpacity={0.25} stroke={stroke} strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

export function RenderingSection() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const rollerWave = useAppStore((s) => s.system.rollerWave);
  const setRollerWave = useAppStore((s) => s.setRollerWave);

  return (
    <Section
      id="card-rendering"
      title={
        <>
          <span className="text-accent">4</span>
          <span className="text-muted"> · </span>
          Rendering
        </>
      }
      description="How the materials meet your 3ds Max scene — not from the data sheet."
    >
      {/* The geometry choice decides everything the tool generates, so its
          two options carry their explanations in plain sight. */}
      <div>
        <p className="text-xs font-medium text-muted">
          How is the glazing modeled in your 3ds Max scene?
        </p>
        <div
          role="radiogroup"
          aria-label="How the glazing is modeled in 3ds Max"
          className="mt-1.5 grid gap-2 sm:grid-cols-2"
        >
          {MODES.map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(option.value)}
                className={`rounded-md border p-3 text-left transition ${
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-border-subtle hover:border-border-strong"
                }`}
              >
                <span
                  className={`flex items-center gap-2.5 text-[13px] font-semibold ${
                    selected ? "text-accent" : "text-foreground"
                  }`}
                >
                  <ModeGlyph mode={option.value} active={selected} />
                  {option.label}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-muted">
                  {option.blurb}
                </span>
              </button>
            );
          })}
        </div>
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
          makes reflections read as glass. Ships as a bump map the apply script wires into the
          material for you.
        </p>
      </div>
    </Section>
  );
}
