"use client";

import { useState } from "react";
import {
  gray,
  lightnessToLuminance,
  linearRGBToHex,
  luminanceToLightness,
  nominalAssemblyHue,
  resolveColorSpec,
  type ColorSpec,
  type RGB,
} from "@/engine";
import { useAppStore } from "@/lib/store";
import { NumberInput, SegmentedControl } from "@/components/ui/fields";

/**
 * Colour, swatch-first: the tool shows the three colours it already derived
 * and the only action is adjusting one. Nothing here asks to be filled in —
 * most cutsheets publish no colour data at all, and the substrate choice is
 * the working default.
 *
 * Brightness never comes from here. The Cutsheet values percentages own the level;
 * a colour only supplies the hue, which is why an entered L* is cross-checked
 * against the matching percentage instead of being used.
 */

type ColorKey = "transmittedColor" | "reflectedColorExt" | "reflectedColorInt";

interface Row {
  key: ColorKey;
  label: string;
  /** Which cutsheet percentage owns this quantity's brightness. */
  metric: string;
}

const ROWS: Row[] = [
  { key: "transmittedColor", label: "Looking through the glass", metric: "VLT" },
  { key: "reflectedColorExt", label: "Reflection, seen from outside", metric: "exterior reflectance" },
  { key: "reflectedColorInt", label: "Reflection, seen from inside", metric: "interior reflectance" },
];

export function GlassColorPanel() {
  const assembly = useAppStore((s) => s.system.assembly);
  const lites = useAppStore((s) => s.system.lites);
  const setAssembly = useAppStore((s) => s.setAssembly);
  const [editing, setEditing] = useState<ColorKey | null>(null);

  const coating = lites.find((l) => l.coating)?.coating;
  const fallbacks: Record<ColorKey, RGB> = {
    transmittedColor: nominalAssemblyHue(lites),
    reflectedColorExt: coating?.reflectedColor ?? gray(1),
    reflectedColorInt: coating?.reflectedColor ?? gray(1),
  };
  const levels: Record<ColorKey, number> = {
    transmittedColor: assembly.tvis,
    reflectedColorExt: assembly.rvisExt,
    reflectedColorInt: assembly.rvisInt,
  };

  const sourceLine = (key: ColorKey, spec: ColorSpec | undefined): string => {
    if (spec && spec.kind !== "auto") {
      return spec.kind === "srgb" ? "adjusted by eye" : "adjusted from the datasheet";
    }
    if (key === "transmittedColor") return "from the tint table";
    return coating?.reflectedColor ? "from the coating's reflected color" : "neutral (nothing measured)";
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-surface-sunken px-2.5 py-2 text-xs leading-snug text-muted">
        These are the colors of the whole assembly: every lite and any coating together, not a
        single lite. Your substrate choices already produce them. Adjust one only if the
        datasheet prints color values, or you are matching a physical sample.
      </p>

      <div className="space-y-2">
        {ROWS.map((row) => {
          const spec = assembly[row.key];
          const hue = resolveColorSpec(spec, fallbacks[row.key]);
          const open = editing === row.key;
          return (
            <div key={row.key} className={open ? "rounded-md border border-accent p-2.5" : ""}>
              <div className="flex items-center gap-3">
                <Swatch color={hue} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-foreground">{row.label}</p>
                  <p className="text-[11px] text-muted/80">{sourceLine(row.key, spec)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(open ? null : row.key)}
                  className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition ${
                    open
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border-subtle text-muted hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  {open ? "Done" : "Adjust…"}
                </button>
              </div>

              {open ? (
                <ColorEditor
                  row={row}
                  spec={spec}
                  hue={hue}
                  level={levels[row.key]}
                  observer={assembly.observer ?? "10"}
                  onChange={(next) => setAssembly({ [row.key]: next })}
                  onObserver={(observer) => setAssembly({ observer })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ColorEditor({
  row,
  spec,
  hue,
  level,
  observer,
  onChange,
  onObserver,
}: {
  row: Row;
  spec: ColorSpec | undefined;
  hue: RGB;
  level: number;
  observer: "2" | "10";
  onChange: (spec: ColorSpec) => void;
  onObserver: (observer: "2" | "10") => void;
}) {
  const kind = spec?.kind ?? "auto";
  const method = kind === "srgb" ? "eye" : kind === "lab" || kind === "xy" ? "typed" : null;

  const startTyped = () => {
    if (method === "typed") return;
    // Seed L* from the measured level so the two agree from the start.
    onChange({ kind: "lab", L: round1(luminanceToLightness(level)), a: 0, b: 0 });
  };
  const startEye = () => {
    if (method === "eye") return;
    onChange({ kind: "srgb", hex: linearRGBToHex(hue) });
  };

  return (
    <div className="mt-2.5 space-y-2.5 border-t border-border-subtle pt-2.5">
      <div className="grid grid-cols-2 gap-2">
        <MethodCard
          selected={method === "typed"}
          title="Type the datasheet's values"
          blurb="Some sheets print color numbers under “color rendering”."
          onClick={startTyped}
        />
        <MethodCard
          selected={method === "eye"}
          title="Match by eye"
          blurb="Pick the color against a printed sample."
          onClick={startEye}
        />
      </div>

      {method === "typed" && (kind === "lab" || kind === "xy") ? (
        <TypedInputs row={row} spec={spec as Extract<ColorSpec, { kind: "lab" | "xy" }>} level={level} onChange={onChange} />
      ) : null}

      {method === "eye" && spec?.kind === "srgb" ? (
        <div className="flex items-center gap-2.5">
          <input
            type="color"
            value={spec.hex}
            onChange={(event) => onChange({ kind: "srgb", hex: event.target.value })}
            className="h-8 w-11 cursor-pointer rounded border border-border-subtle bg-surface p-0.5"
            aria-label={`${row.label} color`}
          />
          <p className="text-[11px] leading-snug text-muted">
            Only the hue is used. How light or dark the glass is stays set by your {row.metric} in
            Data sheet values.
          </p>
        </div>
      ) : null}

      {method !== null ? (
        <button
          type="button"
          onClick={() => onChange({ kind: "auto" })}
          className="text-[11px] font-medium text-accent transition hover:opacity-80"
        >
          Reset to the substrate color
        </button>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
        <p className="text-[11px] leading-snug text-muted/80">
          Sheet says “10° observer” or “2°”? Set it here. If it doesn&apos;t say, leave 10°.
        </p>
        <SegmentedControl
          ariaLabel="Standard observer"
          value={observer}
          onChange={onObserver}
          options={[
            { value: "10", label: "10°", title: "CIE 1964 supplementary observer" },
            { value: "2", label: "2°", title: "CIE 1931 standard observer" },
          ]}
        />
      </div>
    </div>
  );
}

function TypedInputs({
  row,
  spec,
  level,
  onChange,
}: {
  row: Row;
  spec: Extract<ColorSpec, { kind: "lab" | "xy" }>;
  level: number;
  onChange: (spec: ColorSpec) => void;
}) {
  const toLab = () => {
    if (spec.kind !== "lab") onChange({ kind: "lab", L: round1(luminanceToLightness(level)), a: 0, b: 0 });
  };
  const toXy = () => {
    if (spec.kind !== "xy") onChange({ kind: "xy", x: 0.3127, y: 0.329 }); // D65
  };

  return (
    <div className="space-y-2 rounded-md bg-surface-sunken p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">The sheet prints</span>
        <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5">
          <ToggleChip selected={spec.kind === "lab"} onClick={toLab} label="L*a*b*" />
          <ToggleChip selected={spec.kind === "xy"} onClick={toXy} label="x, y" />
        </div>
      </div>

      {spec.kind === "lab" ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <Compact label="L*">
              <NumberInput value={spec.L} onChange={(L) => onChange({ ...spec, L })} min={0} max={100} step={0.1} />
            </Compact>
            <Compact label="a*">
              <NumberInput value={spec.a} onChange={(a) => onChange({ ...spec, a })} min={-60} max={60} step={0.1} />
            </Compact>
            <Compact label="b*">
              <NumberInput value={spec.b} onChange={(b) => onChange({ ...spec, b })} min={-60} max={60} step={0.1} />
            </Compact>
          </div>
          <LightnessCheck L={spec.L} level={level} metric={row.metric} />
          <p className="text-[11px] leading-snug text-muted/80">
            Only a* and b* (the hue) are used. Brightness comes from your {row.metric} in
            Data sheet values, so L* just gets cross-checked against it.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <Compact label="x" width="w-28">
              <NumberInput value={spec.x} onChange={(x) => onChange({ ...spec, x })} min={0} max={1} step={0.0001} />
            </Compact>
            <Compact label="y" width="w-28">
              <NumberInput value={spec.y} onChange={(y) => onChange({ ...spec, y })} min={0} max={1} step={0.0001} />
            </Compact>
          </div>
          <p className="text-[11px] leading-snug text-muted/80">
            Chromaticity carries the hue only; brightness stays set by your {row.metric} in Data sheet values.
          </p>
        </>
      )}
    </div>
  );
}

/** The one number people mistype: says immediately whether L* and the percentage agree. */
function LightnessCheck({ L, level, metric }: { L: number; level: number; metric: string }) {
  const implied = lightnessToLuminance(L);
  const agrees = Math.abs(implied - level) <= 0.02;

  return agrees ? (
    <p className="flex items-center gap-1.5 text-[11px] text-success">
      <CheckIcon />
      L* {L.toFixed(1)} ≈ {(implied * 100).toFixed(0)}%, matching your {(level * 100).toFixed(0)}%{" "}
      {metric}
    </p>
  ) : (
    <p className="text-[11px] text-warning">
      L* {L.toFixed(1)} ≈ {(implied * 100).toFixed(0)}%, but {(level * 100).toFixed(0)}% was entered
      in Data sheet values. Check both came from the same product row.
    </p>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <circle cx="7" cy="7" r="5.5" />
      <path d="M4.5 7.2 L6.3 9 L9.5 5.6" />
    </svg>
  );
}

function MethodCard({
  selected,
  title,
  blurb,
  onClick,
}: {
  selected: boolean;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border p-2.5 text-left transition ${
        selected ? "border-accent bg-accent-soft" : "border-border-subtle hover:border-border-strong"
      }`}
    >
      <p className={`text-xs font-semibold ${selected ? "text-accent" : "text-foreground"}`}>{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{blurb}</p>
    </button>
  );
}

/** Hue at full brightness: an 8% reflectance drawn dark reads as missing data. */
export function Swatch({ color, size = "h-[26px] w-[26px]" }: { color: RGB; size?: string }) {
  const peak = Math.max(color.r, color.g, color.b);
  const hue = peak > 1e-6 ? { r: color.r / peak, g: color.g / peak, b: color.b / peak } : gray(1);
  return (
    <span
      className={`${size} inline-block shrink-0 rounded-full border border-border-strong`}
      style={{ background: linearRGBToHex(hue) }}
      aria-hidden
    />
  );
}

function ToggleChip({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
        selected ? "bg-surface-sunken text-foreground shadow-sm" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Compact({
  label,
  width = "w-24",
  children,
}: {
  label: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-center gap-1.5 ${width}`}>
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
