"use client";

import {
  AIR_GLASS_R0,
  luminance,
  type DerivedOptics,
  type GapInput,
  type LiteInput,
  type SurfaceNumber,
} from "@/engine";
import { substrateDisplayHex } from "@/lib/substrateTint";
import { layout, type DiagramFeature } from "./SurfaceDiagram";

/**
 * The result pane's diagram: the cross-section and the light transmission
 * drawn as one picture.
 *
 * The lites sit at true proportions with their surface numbers on top, and
 * the height of the glass doubles as a percent scale. An orange line follows
 * the light from outside to inside, stepping down at each surface and through
 * each lite, and the two reflectances are drawn as bounces off the outer
 * faces, so the three data sheet numbers appear where they physically happen.
 *
 * Everything orange is light; everything else is the build-up. Switching the
 * light layer off leaves the plain builder.
 *
 * The line is a single pass through the stack. The solver also follows light
 * bouncing between surfaces, so a short connecting segment after the last
 * lite carries the line to the value the materials really give.
 */

const W = 500;
const TOP = 56;
const BOTTOM = 206;
const H = BOTTOM - TOP;
const BUBBLE_Y = 24;
/** Room left of the plot for the scale, right of it for the result label. */
const GUTTER_LEFT = 40;
const GUTTER_RIGHT = 104;

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

const COATING_SHORT: Record<string, string> = {
  "low-e": "low-e",
  reflective: "reflective",
  other: "coating",
};

export function LightDiagram({
  lites,
  gaps,
  coatingSurface,
  coatingKind,
  fritSurface,
  derived,
  entered,
  showEntered,
  light,
  onFeatureClick,
  onAddAt,
}: {
  lites: LiteInput[];
  gaps: GapInput[];
  coatingSurface?: SurfaceNumber;
  coatingKind?: string;
  fritSurface?: SurfaceNumber;
  derived: DerivedOptics | null;
  /** The three data sheet numbers, for the "data sheet says" lines. */
  entered: { tvis: number; rvisExt: number; rvisInt: number };
  /** False while the numbers are still the seeded starting estimate. */
  showEntered: boolean;
  /** Draw the light transmission layer. */
  light: boolean;
  onFeatureClick?: (feature: DiagramFeature) => void;
  onAddAt?: (surface: SurfaceNumber) => void;
}) {
  const { panes, gapSpans } = layout(lites, gaps, W, 26, false);
  const showLight = light && derived !== null;
  const mid = (TOP + BOTTOM) / 2;

  // Light remaining before and after each surface, as a single pass.
  const levels: { before: number; afterFront: number; afterBody: number; afterBack: number }[] = [];
  let v = 1;
  if (derived) {
    lites.forEach((_, i) => {
      const pass = (surface: number) =>
        derived.coating?.surface === surface
          ? luminance(derived.coating.transmission)
          : 1 - AIR_GLASS_R0;
      const before = v;
      const afterFront = before * pass(i * 2 + 1);
      const afterBody = afterFront * luminance(derived.lites[i].internalTransmittance);
      const afterBack = afterBody * pass(i * 2 + 2);
      levels.push({ before, afterFront, afterBody, afterBack });
      v = afterBack;
    });
  }
  const produced = derived ? luminance(derived.recomputed.t) : 0;
  const reflectOut = derived ? luminance(derived.recomputed.rFront) : 0;
  const reflectIn = derived ? luminance(derived.recomputed.rBack) : 0;

  // The scale zooms to the glass in steps of 20 points, so its five ticks
  // always land on round numbers.
  const lowest = Math.min(v, produced, entered.tvis);
  const span = Math.min(100, Math.max(20, Math.ceil(((1 - lowest) * 100 + 3) / 20) * 20));
  const lo = 100 - span;
  const y = (value: number) => TOP + (1 - (value * 100 - lo) / span) * H;
  const ticks = [0, 1, 2, 3, 4].map((k) => ({ y: TOP + (k * H) / 4, label: `${100 - (k * span) / 4}%` }));

  const points: string[] = [];
  if (showLight) {
    points.push(`0,${y(1)}`);
    panes.forEach((pane, i) => {
      const l = levels[i];
      points.push(`${pane.x},${y(l.before)}`, `${pane.x},${y(l.afterFront)}`);
      points.push(`${pane.x + pane.width},${y(l.afterBody)}`, `${pane.x + pane.width},${y(l.afterBack)}`);
    });
    const last = panes[panes.length - 1];
    points.push(`${last.x + last.width + 8},${y(produced)}`, `${W},${y(produced)}`);
  }

  const surfaceX = (surface: number) => {
    const pane = panes[Math.floor((surface - 1) / 2)];
    return surface % 2 === 1 ? pane.x : pane.x + pane.width;
  };
  /** The line's level on the open side of a surface, where its tag sits. */
  const levelBeside = (surface: number) => {
    const l = levels[Math.floor((surface - 1) / 2)];
    if (!l) return 1;
    return surface % 2 === 1 ? l.before : l.afterBack;
  };
  /** Tags ride just above the line, or just under it when there is no room. */
  const tagY = (surface: number, slot: number) => {
    if (!showLight) return mid + (slot === 0 ? 0 : 16);
    const line = y(levelBeside(surface));
    const above = line - 12 - slot * 14;
    return above - 7 >= TOP ? above : line + 12 + slot * 14;
  };

  const first = panes[0];
  const last = panes[panes.length - 1];
  const endY = Math.min(BOTTOM - 22, Math.max(TOP + 4, y(produced)));
  // The inside bounce takes whichever half of the glass the line leaves free.
  const insideBounceY = TOP + H * ((y(produced) - TOP) / H > 0.5 ? 0.2 : 0.78);
  const outsideBounceY = TOP + H * 0.78;
  const off = (key: "tvis" | "rvisExt" | "rvisInt") =>
    derived ? Math.abs(derived.residual[key]) >= 0.02 : false;

  return (
    <svg
      viewBox={`${-GUTTER_LEFT} 0 ${GUTTER_LEFT + W + GUTTER_RIGHT} 232`}
      className="mx-auto h-auto max-h-[min(56vh,520px)] w-full"
      role="img"
      aria-label={
        showLight
          ? `Cross-section of ${lites.length}-lite glazing, exterior at left. ${pct(produced)} of the light passes through, ${pct(reflectOut)} reflects back out and ${pct(reflectIn)} reflects back in.`
          : `Cross-section of ${lites.length}-lite glazing, exterior at left`
      }
    >
      {showLight
        ? ticks.map((tick) => (
            <g key={tick.label}>
              <line x1={0} x2={W} y1={tick.y} y2={tick.y} stroke="var(--border)" strokeWidth={0.75} />
              <text x={-6} y={tick.y + 2.5} textAnchor="end" className="fill-[var(--muted)] font-mono text-[7.5px]">
                {tick.label}
              </text>
            </g>
          ))
        : null}

      {panes.map(({ x, width, lite, index }) => (
        <g key={index}>
          <rect
            x={x}
            y={TOP}
            width={width}
            height={H}
            fill={substrateDisplayHex(lite.substrate)}
            stroke="var(--border-strong)"
            strokeWidth={1}
            rx={1}
          />
          <text x={x + width / 2} y={BOTTOM + 14} textAnchor="middle" className="fill-[var(--muted)] text-[8px]">
            {lite.thickness} mm
          </text>
        </g>
      ))}

      {gapSpans.map((gap, i) => (
        <text
          key={i}
          x={(gap.start + gap.end) / 2}
          y={BOTTOM + 14}
          textAnchor="middle"
          className="fill-[var(--muted)] text-[8px]"
        >
          {gap.width} mm air
        </text>
      ))}

      <text x={0} y={BOTTOM + 14} className="fill-[var(--muted)] text-[7.5px] font-medium tracking-widest">
        EXTERIOR
      </text>
      <text x={W} y={BOTTOM + 14} textAnchor="end" className="fill-[var(--muted)] text-[7.5px] font-medium tracking-widest">
        INTERIOR
      </text>

      {coatingSurface !== undefined ? (
        <line
          x1={surfaceX(coatingSurface)}
          x2={surfaceX(coatingSurface)}
          y1={TOP}
          y2={BOTTOM}
          stroke="var(--accent)"
          strokeWidth={3}
        />
      ) : null}
      {fritSurface !== undefined ? (
        <line
          x1={surfaceX(fritSurface)}
          x2={surfaceX(fritSurface)}
          y1={TOP}
          y2={BOTTOM}
          stroke="var(--warning)"
          strokeWidth={3}
          strokeDasharray="4 3"
        />
      ) : null}

      {showLight ? (
        <g>
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="var(--light)"
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={W} cy={y(produced)} r={3.6} fill="var(--light)" />
          <text x={4} y={y(1) + 10} className="fill-[var(--light)] text-[8px]">
            100% arrives
          </text>

          <text
            x={W + 9}
            y={endY + 4}
            className={`font-mono text-[15px] font-medium ${off("tvis") ? "fill-[var(--warning)]" : "fill-[var(--foreground)]"}`}
          >
            {pct(produced)}
          </text>
          <text x={W + 9} y={endY + 14} className="fill-[var(--muted)] text-[8px]">
            passes through
          </text>
          {showEntered ? (
            <text
              x={W + 9}
              y={endY + 24}
              className={`text-[8px] ${off("tvis") ? "fill-[var(--warning)]" : "fill-[var(--muted)]"}`}
            >
              data sheet says {pct(entered.tvis)}
            </text>
          ) : null}

          <Bounce
            x={first.x - 1.5}
            y={outsideBounceY}
            direction={-1}
            value={pct(reflectOut)}
            label="reflects out"
            entered={showEntered ? pct(entered.rvisExt) : null}
            off={off("rvisExt")}
          />
          <Bounce
            x={last.x + last.width + 1.5}
            y={insideBounceY}
            direction={1}
            value={pct(reflectIn)}
            label="reflects in"
            entered={showEntered ? pct(entered.rvisInt) : null}
            off={off("rvisInt")}
          />
        </g>
      ) : null}

      {coatingSurface !== undefined ? (
        <Tag
          x={surfaceX(coatingSurface)}
          y={tagY(coatingSurface, 0)}
          side={coatingSurface % 2 === 1 ? "left" : "right"}
          text={
            showLight && derived?.coating
              ? `${COATING_SHORT[coatingKind ?? "other"] ?? "coating"} ${pct(luminance(derived.coating.transmission))}`
              : `${COATING_SHORT[coatingKind ?? "other"] ?? "coating"}${coatingKind === "other" || !coatingKind ? "" : " coating"}`
          }
          color="var(--accent)"
          soft="var(--accent-soft)"
          label="Edit the coating"
          onClick={onFeatureClick ? () => onFeatureClick("coating") : undefined}
        />
      ) : null}
      {fritSurface !== undefined ? (
        <Tag
          x={surfaceX(fritSurface)}
          y={tagY(fritSurface, coatingSurface === fritSurface ? 1 : 0)}
          side={fritSurface % 2 === 1 ? "left" : "right"}
          text="frit"
          color="var(--warning)"
          soft="var(--warning-soft)"
          label="Edit the frit"
          onClick={onFeatureClick ? () => onFeatureClick("frit") : undefined}
        />
      ) : null}

      {panes.flatMap(({ index }) =>
        [index * 2 + 1, index * 2 + 2].map((surface) => {
          const hasCoating = coatingSurface === surface;
          const hasFrit = fritSurface === surface;
          return (
            <SurfaceBubble
              key={surface}
              surface={surface as SurfaceNumber}
              x={surfaceX(surface)}
              fill={hasCoating ? "var(--accent)" : hasFrit ? "var(--warning)" : null}
              onClick={
                hasCoating
                  ? onFeatureClick && (() => onFeatureClick("coating"))
                  : hasFrit
                    ? onFeatureClick && (() => onFeatureClick("frit"))
                    : onAddAt && (() => onAddAt(surface as SurfaceNumber))
              }
              adds={!hasCoating && !hasFrit && Boolean(onAddAt)}
            />
          );
        }),
      )}
    </svg>
  );
}

/** A reflectance drawn as light bouncing off a face: in dashed, back solid. */
function Bounce({
  x,
  y,
  direction,
  value,
  label,
  entered,
  off,
}: {
  x: number;
  y: number;
  /** -1 bounces back toward the exterior (left), 1 toward the interior. */
  direction: 1 | -1;
  value: string;
  label: string;
  entered: string | null;
  off: boolean;
}) {
  const far = x + direction * 34;
  const color = off ? "var(--warning)" : "var(--light)";
  const textX = far + direction * 5;
  const anchor = direction === -1 ? "end" : "start";
  return (
    <g>
      <line x1={far} y1={y - 7} x2={x} y2={y} stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="3 3.5" />
      <polyline
        points={`${x},${y} ${far},${y + 7}`}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <polyline
        points={`${far - direction * 5.4},${y + 9.3} ${far},${y + 7} ${far - direction * 4.2},${y + 2.6}`}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x={textX} y={y + 1} textAnchor={anchor} className="font-mono text-[10.5px] font-medium" style={{ fill: color }}>
        {value}
      </text>
      <text x={textX} y={y + 10} textAnchor={anchor} className="text-[7.5px]" style={{ fill: color }}>
        {label}
      </text>
      {entered && off ? (
        <text x={textX} y={y + 19} textAnchor={anchor} className="fill-[var(--warning)] text-[7.5px]">
          data sheet says {entered}
        </text>
      ) : null}
    </g>
  );
}

/** A feature's name, in place, on the open side of its surface. */
function Tag({
  x,
  y,
  side,
  text,
  color,
  soft,
  label,
  onClick,
}: {
  x: number;
  y: number;
  side: "left" | "right";
  text: string;
  color: string;
  soft: string;
  label: string;
  onClick?: () => void;
}) {
  const width = text.length * 4.5 + 12;
  const left = side === "right" ? x + 5 : x - 5 - width;
  return (
    <g
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? label : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      className={onClick ? "cursor-pointer outline-none transition-opacity hover:opacity-80" : undefined}
    >
      <rect x={left} y={y - 7} width={width} height={14} rx={7} fill={soft} stroke={color} strokeWidth={0.9} />
      <text x={left + width / 2} y={y + 2.8} textAnchor="middle" className="text-[8px] font-semibold" style={{ fill: color }}>
        {text}
      </text>
    </g>
  );
}

/**
 * The surface number. It is also the control: a bare surface adds a feature
 * there (marked with a small +), a coated or fritted one opens its card.
 * Keeping the control up here leaves the glass itself free for the light.
 */
function SurfaceBubble({
  surface,
  x,
  fill,
  adds,
  onClick,
}: {
  surface: SurfaceNumber;
  x: number;
  fill: string | null;
  adds: boolean;
  onClick?: (() => void) | false;
}) {
  const handler = onClick || undefined;
  return (
    <g
      role={handler ? "button" : undefined}
      tabIndex={handler ? 0 : undefined}
      aria-label={
        handler ? (adds ? `Add a feature on surface ${surface}` : `Edit the feature on surface ${surface}`) : undefined
      }
      onClick={handler}
      onKeyDown={(event) => {
        if (handler && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          handler();
        }
      }}
      className={handler ? "cursor-pointer outline-none transition-opacity hover:opacity-75" : undefined}
    >
      <line x1={x} y1={BUBBLE_Y + 9} x2={x} y2={TOP - 3} stroke={fill ?? "var(--border-strong)"} strokeWidth={0.75} />
      {/* Finger-sized target; two of them clear each other across a 6 mm lite. */}
      <circle cx={x} cy={BUBBLE_Y} r={16} fill="var(--surface)" fillOpacity={0.01} style={{ pointerEvents: "all" }} />
      <circle
        cx={x}
        cy={BUBBLE_Y}
        r={8.5}
        fill={fill ?? "var(--surface)"}
        stroke={fill ?? "var(--border-strong)"}
        strokeWidth={1}
      />
      <text
        x={x}
        y={BUBBLE_Y + 3}
        textAnchor="middle"
        className={`pointer-events-none select-none font-mono text-[8.5px] font-medium ${fill ? "fill-white" : "fill-[var(--foreground)]"}`}
      >
        {surface}
      </text>
      {adds ? (
        <g className="pointer-events-none">
          <circle cx={x + 7.5} cy={BUBBLE_Y - 7.5} r={4.2} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={0.8} />
          <path
            d={`M${x + 7.5} ${BUBBLE_Y - 9.7} V${BUBBLE_Y - 5.3} M${x + 5.3} ${BUBBLE_Y - 7.5} H${x + 9.7}`}
            stroke="var(--muted)"
            strokeWidth={0.9}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      ) : null}
    </g>
  );
}
