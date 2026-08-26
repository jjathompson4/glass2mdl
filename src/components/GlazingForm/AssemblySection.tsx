"use client";

import type { Fraction } from "@/engine";
import { useAppStore } from "@/lib/store";
import { PercentField, Section, StepTitle } from "@/components/ui/fields";

/**
 * The three numbers every cutsheet reports. Colour and the observer setting
 * live in step 4's Glass colour panel — they only matter in the rare case
 * where colour data was published.
 *
 * An energy bar sits underneath because transmitted plus reflected light
 * cannot exceed what arrived, and watching that budget fill catches a
 * mistyped column immediately. The absorbed remainder is displayed, never
 * entered: cutsheets don't print it, because it is fully determined by the
 * other two.
 */
export function AssemblySection() {
  const assembly = useAppStore((s) => s.system.assembly);
  const setAssembly = useAppStore((s) => s.setAssembly);

  const transmitted = clamp(assembly.tvis);
  const reflected = clamp(assembly.rvisExt);
  const absorbed = Math.max(0, 1 - transmitted - reflected);
  const over = transmitted + reflected > 1.0001;

  const set = (patch: Partial<typeof assembly>) => setAssembly(patch);

  return (
    <Section
      title={<StepTitle n={3}>Cutsheet numbers</StepTitle>}
      description="The three visible-light values from the performance table. Everything else is derived from these."
    >
      {/* Slider ranges cap at what energy conservation allows (T + R ≤ 100%),
          so dragging can't produce impossible glass. Typed values are never
          rewritten — a mistyped pair gets flagged below instead. */}
      <div className="grid gap-4 md:grid-cols-3">
        <PercentField
          label="Transmittance (VLT)"
          value={assembly.tvis}
          max={Math.max(0, (1 - reflected) * 100)}
          onChange={(tvis) => set({ tvis: tvis as Fraction })}
        />
        <PercentField
          label="Reflectance, exterior"
          value={assembly.rvisExt}
          max={Math.max(0, (1 - transmitted) * 100)}
          onChange={(rvisExt) => set({ rvisExt: rvisExt as Fraction })}
        />
        <PercentField
          label="Reflectance, interior"
          value={assembly.rvisInt}
          max={Math.max(0, (1 - transmitted) * 100)}
          onChange={(rvisInt) => set({ rvisInt: rvisInt as Fraction })}
        />
      </div>

      <div className="mt-4">
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-sunken">
          <span
            className="bg-accent transition-all"
            style={{ width: `${transmitted * 100}%` }}
            title="Transmitted"
          />
          <span
            className={`transition-all ${over ? "bg-danger" : "bg-accent/45"}`}
            style={{ width: `${reflected * 100}%` }}
            title="Reflected"
          />
          <span
            className="bg-border-strong/60 transition-all"
            style={{ width: `${absorbed * 100}%` }}
            title="Absorbed"
          />
        </div>
        <p className={`mt-1.5 text-xs ${over ? "text-danger" : "text-muted"}`}>
          {over
            ? "Transmitted plus reflected light exceeds 100%. Check which columns these came from."
            : `${(transmitted * 100).toFixed(0)}% passes through, ${(reflected * 100).toFixed(0)}% reflects back out, and the remaining ${(absorbed * 100).toFixed(0)}% is absorbed in the glass. Absorption is never entered: cutsheets don't print it, because it is exactly what the other two leave over.`}
        </p>
      </div>
    </Section>
  );
}

const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
