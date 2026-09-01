"use client";

import { useState } from "react";
import {
  linearRGBToHex,
  luminance,
  resolveColorSpecAbsolute,
  DEFAULT_FINISH_ALBEDO,
  type DerivedOptics,
  type SpandrelFinish,
  type SpandrelInput,
  type SurfaceNumber,
} from "@/engine";
import { defaultSpandrel, useAppStore } from "@/lib/store";
import { lookupRal } from "@/lib/ral";
import { surfaceOptions } from "@/lib/surfaces";
import { fromDisplay, toDisplay, unitLabel, unitStep } from "@/lib/units";
import { ColorInput, Field, NumberInput, SegmentedControl, Select, TextInput } from "@/components/ui/fields";

/**
 * The spandrel card's body. A spandrel is the same glass with an opaque
 * finish behind it, so the card asks only about the finish: which kind,
 * where, what colour. The colour is the one input here that sets brightness
 * as well as hue — nothing on a data sheet measures a paint — and the footer
 * shows what that colour turns into once it sits behind the fitted glass,
 * which is the thing to judge in a render.
 */
export function SpandrelControls({ derived }: { derived: DerivedOptics | null }) {
  const spandrel = useAppStore((s) => s.system.spandrel);
  const lites = useAppStore((s) => s.system.lites);
  const unit = useAppStore((s) => s.unit);
  const setSpandrel = useAppStore((s) => s.setSpandrel);
  const updateSpandrel = useAppStore((s) => s.updateSpandrel);

  if (!spandrel) return null;

  const changeKind = (kind: SpandrelInput["kind"]) => {
    if (kind === spandrel.kind) return;
    // Colour and its label carry over; the geometry is the kind's own.
    const next = defaultSpandrel(kind, lites.length);
    setSpandrel({ ...next, color: spandrel.color, colorLabel: spandrel.colorLabel });
  };

  const backFaces = surfaceOptions(lites.length).filter((o) => o.value % 2 === 0);

  return (
    <div className="space-y-3">
      <SegmentedControl<SpandrelInput["kind"]>
        ariaLabel="Spandrel construction"
        value={spandrel.kind}
        onChange={changeKind}
        options={[
          { value: "flood-coat", label: "Flood coat", title: "Opaque paint on the back of a lite" },
          { value: "back-pan", label: "Back pan", title: "Metal pan behind an air cavity (shadow box)" },
        ]}
      />

      {spandrel.kind === "flood-coat" ? (
        <div className="max-w-sm">
          <Field label="Painted surface" hint="Paint goes on the back of a lite. #4 is the usual spot on a double unit.">
            <Select
              value={String(spandrel.surface)}
              onChange={(value) => updateSpandrel({ surface: Number(value) as SurfaceNumber })}
              options={backFaces.map((o) => ({ value: String(o.value), label: o.label }))}
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label={`Cavity depth (${unitLabel(unit)})`} hint="Glass to pan face.">
            <NumberInput
              value={toDisplay(spandrel.cavity, unit)}
              onChange={(value) => updateSpandrel({ cavity: fromDisplay(value, unit) })}
              min={0}
              step={unitStep(unit)}
            />
          </Field>
          <Field label="Pan finish">
            <SegmentedControl<SpandrelFinish>
              ariaLabel="Pan finish"
              value={spandrel.finish}
              onChange={(finish) => updateSpandrel({ finish })}
              options={[
                { value: "matte", label: "Painted", title: "Matte paint, e.g. Kynar" },
                { value: "metallic", label: "Metallic", title: "Anodized or brushed metal" },
              ]}
            />
          </Field>
        </div>
      )}

      <FinishColor spandrel={spandrel} onChange={updateSpandrel} />

      <ReadsAs spandrel={spandrel} derived={derived} />
    </div>
  );
}

/**
 * Colour by RAL number, a manufacturer chart, or a sample photo: the number
 * fills the swatch from a table, and the swatch is always adjustable by eye.
 * The label rides into the README so the export says where the colour came
 * from.
 */
function FinishColor({
  spandrel,
  onChange,
}: {
  spandrel: SpandrelInput;
  onChange: (patch: { color?: SpandrelInput["color"]; colorLabel?: string }) => void;
}) {
  const [ralText, setRalText] = useState("");
  const [ralMiss, setRalMiss] = useState(false);
  const hex = linearRGBToHex(resolveColorSpecAbsolute(spandrel.color, DEFAULT_FINISH_ALBEDO));

  const applyRal = (text: string) => {
    setRalText(text);
    const hit = lookupRal(text);
    setRalMiss(text.trim().length >= 4 && !hit);
    if (hit) {
      onChange({ color: { kind: "srgb", hex: hit.hex }, colorLabel: `RAL ${hit.code} ${hit.name}` });
    }
  };

  return (
    <div className="rounded-md bg-surface-sunken p-2.5">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
        <Field label="Finish color" hint="Match by eye against a chart or sample.">
          <ColorInput
            value={hex}
            onChange={(next) => onChange({ color: { kind: "srgb", hex: next } })}
          />
        </Field>
        <Field label="RAL number" hint={ralMiss ? "Not in the table. Match the swatch by eye instead." : "Fills the swatch; then adjust it by eye if needed."} error={undefined}>
          <TextInput value={ralText} onChange={applyRal} placeholder="e.g. 7024" ariaLabel="RAL number" />
        </Field>
        <Field label="Color name, for the README" hint="Kynar name, anodized, sample photo…">
          <TextInput
            value={spandrel.colorLabel ?? ""}
            onChange={(colorLabel) => onChange({ colorLabel: colorLabel || undefined })}
            placeholder="e.g. Dark bronze"
            ariaLabel="Finish color label"
          />
        </Field>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted/80">
        Unlike the glass colors, this one sets brightness too: no data sheet measures a paint, so
        the color is used as given. RAL values are the usual approximations, not official.
      </p>
    </div>
  );
}

/** The finish through the fitted glass, beside the glass on its own: what a render will show. */
function ReadsAs({ spandrel, derived }: { spandrel: SpandrelInput; derived: DerivedOptics | null }) {
  const seen = derived?.spandrel;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle pt-2.5 text-xs text-muted">
      <span className="font-medium">Seen from outside</span>
      {seen ? (
        <>
          <span className="inline-flex items-center gap-2">
            <FlatSwatch hex={linearRGBToHex(seen.readsAs)} />
            <span>
              reads as{" "}
              <span className="font-mono text-foreground">{linearRGBToHex(seen.readsAs).toUpperCase()}</span>
              <span className="text-muted/80"> · {pct(luminance(seen.readsAs))}</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2">
            <FlatSwatch hex={linearRGBToHex(seen.finish)} />
            <span>
              {spandrel.kind === "flood-coat" ? "paint alone" : "pan alone"}
              <span className="text-muted/80"> · {pct(luminance(seen.finish))}</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2">
            <FlatSwatch hex={linearRGBToHex(seen.glassOnly)} />
            <span>
              glass alone<span className="text-muted/80"> · {pct(luminance(seen.glassOnly))}</span>
            </span>
          </span>
        </>
      ) : (
        <span>waiting on a solvable construction</span>
      )}
      <span className="basis-full text-[11px] leading-snug text-muted/80">
        The first swatch is the finish through this glass, darkened by the double pass and topped by
        the glass reflection. Judge the render against that, not against the paint chip.
      </span>
    </div>
  );
}

/** An absolute colour, not a hue: the whole point here is how dark it reads. */
function FlatSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block h-[22px] w-[22px] shrink-0 rounded-md border border-border-strong"
      style={{ background: hex }}
      aria-hidden
    />
  );
}
