"use client";

import {
  clampRGB,
  hexToLinearRGB,
  linearRGBToHex,
  luminance,
  type CoatingInput,
  type CoatingOverrides,
  type DerivedOptics,
  type RGB,
} from "@/engine";
import { NumberInput } from "@/components/ui/fields";

type OverrideKey = keyof CoatingOverrides;

const ROWS: { key: OverrideKey; label: string; hint: string }[] = [
  { key: "transmission", label: "Transmits", hint: "Light passing through the coating layer" },
  { key: "reflectanceExt", label: "Reflects, out", hint: "Seen from the exterior side" },
  { key: "reflectanceInt", label: "Reflects, in", hint: "Seen from the cavity side" },
];

/** Only the colour-valued fields; `surface` on the same object is a number. */
const DERIVED: Record<OverrideKey, "transmission" | "reflectanceExt" | "reflectanceInt"> = {
  transmission: "transmission",
  reflectanceExt: "reflectanceExt",
  reflectanceInt: "reflectanceInt",
};

/** Hue at full brightness, so a 2% reflectance is still a readable colour. */
function normalizeHue(color: RGB): RGB {
  const peak = Math.max(color.r, color.g, color.b);
  if (peak <= 1e-6) return { r: 1, g: 1, b: 1 };
  return { r: color.r / peak, g: color.g / peak, b: color.b / peak };
}

/** Recombine an edited hue with an edited level into one value. */
function compose(hue: RGB, level: number): RGB {
  const l = luminance(hue);
  if (l <= 1e-6) return { r: level, g: level, b: level };
  const k = level / l;
  return clampRGB({ r: hue.r * k, g: hue.g * k, b: hue.b * k });
}

/**
 * The coating's own optical values, fitted from the assembly numbers.
 *
 * Read-only until overridden: cutsheets describe the whole assembly, not the
 * coating itself, so normally there is nothing to do here. An override wins
 * over the fit; the remaining values absorb what they can, and any gap shows
 * up honestly in the Download card's fit check rather than the override quietly
 * winning.
 */
export function CoatingOverridesPanel({
  coating,
  derived,
  onChange,
}: {
  coating: CoatingInput;
  derived: DerivedOptics | null;
  onChange: (coating: CoatingInput) => void;
}) {
  const fitted = derived?.coating;

  const setOverride = (key: OverrideKey, value: RGB | undefined) => {
    const overrides: CoatingOverrides = { ...coating.overrides };
    if (value) overrides[key] = value;
    else delete overrides[key];
    onChange({ ...coating, overrides: Object.keys(overrides).length ? overrides : undefined });
  };

  return (
    <div className="space-y-2.5">
      <p className="rounded-md bg-surface-sunken px-2.5 py-2 text-xs leading-snug text-muted">
        Cutsheets describe the whole assembly, not the coating itself, so the tool works the
        coating&apos;s own optical values out from your three numbers. They are shown read-only here and
        in the Download card&apos;s fit check. Override one only when the manufacturer publishes it directly.
      </p>

      <div className="space-y-1.5">
        {ROWS.map(({ key, label, hint }) => {
          const override = coating.overrides?.[key];
          const value = override ?? (fitted ? fitted[DERIVED[key]] : undefined);
          const level = value ? luminance(value) : 0;

          return (
            <div
              key={key}
              className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${
                override ? "border-accent/40 bg-accent-soft/40" : "border-border-subtle"
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-border-strong"
                style={{ background: value ? linearRGBToHex(normalizeHue(value)) : "transparent" }}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground">{label}</p>
                <p className="text-[10px] text-muted">{hint}</p>
              </div>

              {override ? (
                <>
                  <div className="w-20">
                    <NumberInput
                      value={level * 100}
                      onChange={(percent) =>
                        setOverride(key, compose(normalizeHue(override), percent / 100))
                      }
                      min={0}
                      max={100}
                      step={0.5}
                      suffix="%"
                    />
                  </div>
                  <input
                    type="color"
                    value={linearRGBToHex(normalizeHue(override))}
                    onChange={(event) =>
                      setOverride(key, compose(hexToLinearRGB(event.target.value), level))
                    }
                    className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border-subtle bg-surface p-0.5"
                    aria-label={`${label} hue`}
                  />
                  <button
                    type="button"
                    onClick={() => setOverride(key, undefined)}
                    className="shrink-0 rounded px-1.5 py-1 text-[10px] font-medium text-accent transition hover:bg-accent-soft"
                  >
                    Use fitted
                  </button>
                </>
              ) : (
                <>
                  <span className="tabular-nums text-xs text-muted">
                    {value ? `${(level * 100).toFixed(1)}% fitted` : "—"}
                  </span>
                  <button
                    type="button"
                    disabled={!value}
                    onClick={() => value && setOverride(key, clampRGB(value))}
                    className="shrink-0 rounded border border-border-subtle px-2 py-1 text-[10px] font-medium text-muted transition hover:border-border-strong hover:text-foreground disabled:opacity-40"
                  >
                    Override…
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {coating.overrides ? (
        <p className="text-[11px] leading-snug text-muted">
          An override is held exactly. If the Download card&apos;s fit check grew a residual, the override
          disagrees with the measured performance.
        </p>
      ) : null}
    </div>
  );
}
