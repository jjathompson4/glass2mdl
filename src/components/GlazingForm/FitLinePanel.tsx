"use client";

import { AIR_GLASS_R0, litePositionNames, luminance, type DerivedOptics } from "@/engine";
import { useAppStore } from "@/lib/store";
import { toDisplay, unitLabel } from "@/lib/units";
import { FIT_QUANTITIES, fitVerdict } from "./fitVerdict";

/**
 * The fit, drawn: light arriving from outside is followed through the
 * build-up as one descending line, so the values the solver chose (each
 * lite's body, the coating) can be told apart from the ones the glass fixes
 * (bare surface reflections). Beneath it, each data sheet number sits on a
 * track beside what the materials actually produce.
 *
 * The line is a single pass. The solver also follows light bouncing between
 * surfaces, so one closing step carries the line from the single-pass product
 * to the real produced value instead of pretending the two are the same.
 */

const W = 700;
const H = 220;
const LEFT = 46;
const TOP = 26;
const RIGHT = 104;
const BOTTOM = 8;

interface Segment {
  x1: number;
  v1: number;
  x2: number;
  v2: number;
  fitted: boolean;
  dashed?: boolean;
}

const COATING_NAMES: Record<string, string> = {
  "low-e": "Low-e coating",
  reflective: "Reflective coating",
  other: "Coating",
};

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

export function FitLinePanel({ derived }: { derived: DerivedOptics }) {
  const system = useAppStore((s) => s.system);
  const unit = useAppStore((s) => s.unit);
  const assemblyEdited = useAppStore((s) => s.assemblyEdited);

  const lites = system.lites;
  const n = lites.length;
  const coatingInput = lites.find((l) => l.coating)?.coating;
  const coating = derived.coating;
  const coatingName = COATING_NAMES[coatingInput?.kind ?? "other"] ?? "Coating";
  const positions = litePositionNames(n);
  const verdict = fitVerdict(derived, system.assembly);

  // Horizontal layout: lites are equal bands, cavities share what is left.
  const margin = n === 1 ? 250 : 110;
  const liteW = n === 1 ? 200 : 90;
  const gapW = n > 1 ? (W - 2 * margin - n * liteW) / (n - 1) : 0;
  const liteX = (i: number) => margin + i * (liteW + gapW);

  const segments: Segment[] = [];
  const plateaus: { x: number; v: number }[] = [];
  const surfaceNotes: string[][] = lites.map(() => []);
  let v = 1;
  let x = 0;
  let lowest = 1;

  lites.forEach((_, i) => {
    const x0 = liteX(i);
    const x1 = x0 + liteW;
    segments.push({ x1: x, v1: v, x2: x0, v2: v, fitted: false });
    plateaus.push({ x: (x + x0) / 2, v });

    const passSurface = (surface: number, at: number) => {
      const coated = coating?.surface === surface;
      const factor = coated ? luminance(coating.transmission) : 1 - AIR_GLASS_R0;
      segments.push({ x1: at, v1: v, x2: at, v2: v * factor, fitted: coated });
      surfaceNotes[i].push(
        coated
          ? `Surface ${surface}: ${coatingName.toLowerCase()} transmits ${pct(factor)}`
          : `Surface ${surface} reflects ${pct(AIR_GLASS_R0)}, fixed by the glass`,
      );
      v *= factor;
    };

    passSurface(i * 2 + 1, x0);
    const body = luminance(derived.lites[i].internalTransmittance);
    segments.push({ x1: x0, v1: v, x2: x1, v2: v * body, fitted: true });
    v *= body;
    passSurface(i * 2 + 2, x1);
    lowest = Math.min(lowest, v);
    x = x1;
  });

  // Closing step: from the single-pass product to what the solver produces.
  const produced = luminance(derived.recomputed.t);
  const closing = produced - v;
  const showClosing = Math.abs(closing) >= 0.0005;
  const closeX = x + Math.min(44, (W - x) / 2);
  segments.push({ x1: x, v1: v, x2: closeX, v2: v, fitted: false });
  if (showClosing) {
    segments.push({ x1: closeX, v1: v, x2: closeX, v2: produced, fitted: false, dashed: true });
  }
  segments.push({ x1: closeX, v1: produced, x2: W, v2: produced, fitted: false });

  const target = system.assembly.tvis;
  const floor = Math.min(lowest, produced, target) * 100;
  const lo = Math.min(90, Math.max(0, Math.floor((floor - 4) / 10) * 10));
  const tickStep = 100 - lo > 60 ? 20 : 10;
  const ticks: number[] = [];
  for (let t = 100; t >= lo; t -= tickStep) ticks.push(t);
  const y = (value: number) => TOP + (1 - (value * 100 - lo) / (100 - lo)) * H;
  const px = (value: number) => LEFT + value;

  const closingLabel = `${system.frit ? "frit and bounces" : "bounces"} between surfaces ${
    closing >= 0 ? "add" : "take"
  } ${Math.abs(closing * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          How the fit gets there
        </h3>
        <p className="mt-1 max-w-[640px] text-sm leading-snug text-muted">
          Light arriving from outside, followed through the build-up. Blue steps are values the
          fit chose to hit your numbers. Gray steps are fixed by the glass itself.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-sunken px-3 py-3.5">
        <svg
          viewBox={`0 0 ${LEFT + W + RIGHT} ${TOP + H + BOTTOM}`}
          className="h-auto w-full min-w-[640px]"
          role="img"
          aria-label={`Light remaining at each step through the glazing, from 100% outside to ${pct(produced)} inside`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={px(0)}
                x2={px(W)}
                y1={y(t / 100)}
                y2={y(t / 100)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={LEFT - 8}
                y={y(t / 100) + 4}
                textAnchor="end"
                className="fill-[var(--muted)] font-mono text-[12px]"
              >
                {t}%
              </text>
            </g>
          ))}

          <text x={px(margin / 2)} y={14} textAnchor="middle" className="fill-[var(--muted)] text-[11px] font-medium tracking-widest">
            OUTSIDE
          </text>
          <text x={px(W - margin / 2)} y={14} textAnchor="middle" className="fill-[var(--muted)] text-[11px] font-medium tracking-widest">
            INSIDE
          </text>

          {lites.map((lite, i) => {
            const x0 = liteX(i);
            const body = luminance(derived.lites[i].internalTransmittance);
            return (
              <g key={i}>
                <rect
                  x={px(x0)}
                  y={TOP}
                  width={liteW}
                  height={H}
                  fill="var(--foreground)"
                  fillOpacity={0.07}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
                <text x={px(x0 + liteW / 2)} y={14} textAnchor="middle" className="fill-[var(--muted)] text-[11px] font-medium tracking-widest">
                  LITE {i + 1}
                </text>
                <text x={px(x0 + liteW / 2)} y={TOP + H - 10} textAnchor="middle" className="fill-[var(--accent)] text-[12px] font-medium">
                  passes {pct(body, 0)}
                </text>
                {i < n - 1 && gapW >= 80 ? (
                  <text x={px(x0 + liteW + gapW / 2)} y={14} textAnchor="middle" className="fill-[var(--muted)] text-[11px] font-medium tracking-widest">
                    AIR SPACE
                  </text>
                ) : null}
              </g>
            );
          })}

          {coating ? (
            <line
              x1={px(liteX(Math.floor((coating.surface - 1) / 2)) + (coating.surface % 2 === 0 ? liteW : 0))}
              x2={px(liteX(Math.floor((coating.surface - 1) / 2)) + (coating.surface % 2 === 0 ? liteW : 0))}
              y1={TOP}
              y2={TOP + H}
              stroke="var(--accent)"
              strokeWidth={3}
              strokeOpacity={0.45}
            />
          ) : null}

          {segments.map((s, i) => (
            <line
              key={i}
              x1={px(s.x1)}
              y1={y(s.v1)}
              x2={px(s.x2)}
              y2={y(s.v2)}
              stroke={s.fitted ? "var(--accent)" : "var(--muted)"}
              strokeWidth={s.fitted ? 3.5 : 2.5}
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "2 5" : undefined}
            />
          ))}

          {plateaus.map((p, i) => (
            <text
              key={i}
              x={i === 0 ? px(8) : px(p.x)}
              y={i === 0 ? y(p.v) + 17 : y(p.v) - 8}
              textAnchor={i === 0 ? "start" : "middle"}
              className="fill-[var(--foreground)] font-mono text-[12px]"
            >
              {i === 0 ? "100% arrives" : pct(p.v)}
            </text>
          ))}

          {/* Target ring and produced dot share the right edge, so a miss shows as a gap. */}
          <circle cx={px(W)} cy={y(target)} r={7.5} fill="none" stroke="var(--foreground)" strokeWidth={2} />
          <circle cx={px(W)} cy={y(produced)} r={5} fill="var(--accent)" />
          <text x={px(W) + 16} y={y(produced) + 2} className="fill-[var(--foreground)] font-mono text-[19px] font-medium">
            {pct(produced)}
          </text>
          <text x={px(W) + 16} y={y(produced) + 20} className="fill-[var(--muted)] text-[12px]">
            target {pct(target)}
          </text>
        </svg>
        <p className="mt-2 pl-1 text-[13px] leading-snug text-muted">
          Drawn as a single pass so it reads as one line.
          {showClosing
            ? ` The dotted step is the rest of what the fit accounts for: ${closingLabel}.`
            : " Here the single pass already lands on the produced value."}
        </p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h4 className="text-base font-semibold text-foreground">Target against result</h4>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-foreground" aria-hidden />
              {assemblyEdited ? "from the data sheet" : "starting estimate"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
              produced by the materials
            </span>
          </div>
        </div>

        {FIT_QUANTITIES.map(({ key, produced: field, label }) => {
          const entered = system.assembly[key];
          const made = luminance(derived.recomputed[field]);
          const off = Math.abs(derived.residual[key]) >= 0.02;
          const lowEnd = Math.min(entered, made);
          return (
            <div
              key={key}
              className="grid items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[180px_minmax(0,1fr)_150px]"
            >
              <span className={`text-sm ${off ? "font-medium text-warning" : "text-foreground"}`}>
                {label}
              </span>
              <div className="relative h-5">
                <span className="absolute inset-x-0 top-[9px] h-0.5 bg-border-strong/70" />
                {off ? (
                  <span
                    className="absolute top-2 h-1 rounded-sm bg-warning"
                    style={{ left: `${lowEnd * 100}%`, width: `${Math.abs(entered - made) * 100}%` }}
                  />
                ) : null}
                <span
                  className="absolute top-0.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-foreground bg-surface"
                  style={{ left: `${clamp(entered) * 100}%` }}
                />
                <span
                  className={`absolute top-[5px] h-2.5 w-2.5 -translate-x-1/2 rounded-full ${off ? "bg-warning" : "bg-accent"}`}
                  style={{ left: `${clamp(made) * 100}%` }}
                />
              </div>
              <span className={`font-mono text-sm tabular-nums sm:text-right ${off ? "text-warning" : "text-foreground"}`}>
                {(entered * 100).toFixed(1)} → {pct(made)}
              </span>
            </div>
          );
        })}

        <div className="hidden gap-x-4 font-mono text-xs text-muted sm:grid sm:grid-cols-[180px_minmax(0,1fr)_150px]">
          <span />
          <div className="flex justify-between">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          <span />
        </div>

        <p
          className={`mt-3 border-t border-border-subtle pt-3 text-sm leading-snug ${
            verdict.tone === "off" ? "text-warning" : verdict.tone === "exact" ? "text-success" : "text-muted"
          }`}
        >
          {verdict.title}.
          {verdict.tone === "off"
            ? " Usually this means the numbers belong to a different construction. Check the lite count, the coated surface, and the substrate against the data sheet."
            : null}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {derived.lites.map((lite, i) => {
          const sigma = luminance(lite.absorptionCoefficient);
          const thickness = lites[i].thickness;
          const absorbed = (1 - Math.exp(-sigma * (thickness / 1000))) * 100;
          const coated = coating && Math.floor((coating.surface - 1) / 2) === i;
          return (
            <div key={lite.index} className="rounded-xl border border-border-subtle p-3.5">
              <p className="text-[13px] text-muted">
                Lite {i + 1}, {positions[i]}, {coated ? "coated" : "bare glass"}
              </p>
              <p className="mt-1 text-[15px] text-foreground">
                Glass body passes{" "}
                <span className="font-mono text-accent">
                  {pct(luminance(lite.internalTransmittance), 0)}
                </span>
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">
                Absorption {sigma.toFixed(1)} per meter, about {absorbed.toFixed(0)}% across{" "}
                {toDisplay(thickness, unit)} {unitLabel(unit)}
              </p>
              <ul className="mt-2 space-y-0.5 border-t border-border-subtle pt-2 text-[13px] leading-snug text-muted">
                {surfaceNotes[i].map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          );
        })}

        {coating ? (
          <div className="rounded-xl border border-accent/50 bg-accent-soft/50 p-3.5">
            <p className="text-[13px] text-accent">
              {coatingName}, surface {coating.surface}
            </p>
            <p className="mt-1 text-[15px] text-foreground">
              Transmits <span className="font-mono text-accent">{pct(luminance(coating.transmission))}</span>
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              Reflects {pct(luminance(coating.reflectanceExt))} outward,{" "}
              {pct(luminance(coating.reflectanceInt))} inward
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
