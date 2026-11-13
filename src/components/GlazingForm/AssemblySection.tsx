"use client";

import type { Fraction } from "@/engine";
import { useAppStore } from "@/lib/store";
import { Field, PercentInput, Section, TextInput } from "@/components/ui/fields";

/**
 * The data sheet header, typed straight in: the product name and the three
 * numbers every cutsheet reports. Color and the observer setting live in
 * Construction's Glass color panel — they only matter in the rare case where
 * color data was published.
 *
 * An energy bar sits underneath because transmitted plus reflected light
 * cannot exceed what arrived, and watching that budget fill catches a
 * mistyped column immediately. The absorbed remainder is displayed, never
 * entered: cutsheets don't print it, because it is fully determined by the
 * other two.
 */
export function AssemblySection() {
  const name = useAppStore((s) => s.system.name);
  const setName = useAppStore((s) => s.setName);
  const assembly = useAppStore((s) => s.system.assembly);
  const setAssembly = useAppStore((s) => s.setAssembly);

  const transmitted = clamp(assembly.tvis);
  const reflected = clamp(assembly.rvisExt);
  const absorbed = Math.max(0, 1 - transmitted - reflected);
  const over = transmitted + reflected > 1.0001;

  const set = (patch: Partial<typeof assembly>) => setAssembly(patch);

  return (
    <Section
      id="card-cutsheet"
      title={
        <>
          <span className="text-accent">1</span>
          <span className="text-muted"> · </span>
          Data sheet values
        </>
      }
      helpLabel="data sheet values"
      help={
        <>
          <p>
            Type the product name and the three visible-light values from the performance table.
            The tool works out each lite&apos;s material properties so the rendered assembly
            reproduces these numbers.
          </p>
          <p>
            The absorbed share is calculated, not entered. Data sheets don&apos;t print it
            because the other two values determine it.
          </p>
        </>
      }
    >
      <div>
        <Field label="Product name" hint="Becomes the material and file name.">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="e.g. Solarban 60 on clear"
            ariaLabel="Product name"
          />
        </Field>
      </div>

      {/* Typed values are never rewritten — an impossible pair gets flagged
          below instead of being silently corrected. */}
      <div className="mt-3.5 grid grid-cols-3 items-end gap-2.5">
        <Field label="Transmittance (VLT)">
          <PercentInput value={assembly.tvis} onChange={(tvis) => set({ tvis: tvis as Fraction })} />
        </Field>
        <Field label="Reflectance, exterior">
          <PercentInput
            value={assembly.rvisExt}
            onChange={(rvisExt) => set({ rvisExt: rvisExt as Fraction })}
          />
        </Field>
        <Field label="Reflectance, interior">
          <PercentInput
            value={assembly.rvisInt}
            onChange={(rvisInt) => set({ rvisInt: rvisInt as Fraction })}
          />
        </Field>
      </div>

      <div className="mt-4">
        <div className="flex h-3 overflow-hidden rounded-full bg-border-strong/50">
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
        {over ? (
          <p className="mt-1.5 text-[13px] text-danger">
            Transmitted plus reflected light exceeds 100%. Check which columns these came from.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
              {(transmitted * 100).toFixed(0)}% passes through
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent/45" aria-hidden />
              {(reflected * 100).toFixed(0)}% reflects back out
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-border-strong/60" aria-hidden />
              {(absorbed * 100).toFixed(0)}% absorbed in the glass
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}

const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
