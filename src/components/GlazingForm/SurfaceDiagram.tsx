"use client";

import type { GapInput, LiteInput, SurfaceNumber } from "@/engine";

/**
 * Cross-section through the glazing, exterior on the left.
 *
 * Cutsheets identify coatings by surface number, and mixing up #2 and #3 puts
 * a coating in the wrong cavity. Drawing the build-up with every feature
 * tagged in place lets the surface dropdowns be verified at a glance — and
 * since the diagram is pinned while the cards scroll, the tags double as
 * navigation: tapping one jumps to that feature's card.
 */

const VIEWBOX_WIDTH = 420;
const HEIGHT = 190;
const GLASS_TOP = 52;
const GLASS_BOTTOM = 152;
const PADDING = 26;

/**
 * Millimetres of build-up the drawing is sized around — a generous triple
 * (6 + 12 + 6 + 12 + 6 = 42mm) plus headroom.
 *
 * The scale is fixed against this rather than stretched to fill the width, so
 * a 6mm lite is drawn the same width whether it stands alone or sits in a
 * triple. Fitting to width made a monolithic lite look ten times thicker than
 * the identical lite in an IGU, which reads as the glass having changed.
 */
const REFERENCE_SPAN_MM = 52;

/** Keeps a thin lite visible even at true scale. */
const MIN_PANE_PX = 9;

interface PaneLayout {
  x: number;
  width: number;
  lite: LiteInput;
  index: number;
}

interface Layout {
  panes: PaneLayout[];
  gapSpans: { start: number; end: number; width: number }[];
}

/**
 * Lay the build-up out at true proportions and centre it.
 *
 * Gaps are drawn at their real width relative to the panes — a 12mm cavity
 * really is twice a 6mm lite — so the drawing reads as a section rather than a
 * diagram. Only an unusually deep build-up falls back to shrinking to fit.
 */
function layout(
  lites: LiteInput[],
  gaps: GapInput[],
  viewWidth = VIEWBOX_WIDTH,
  padding = PADDING,
): Layout {
  const drawable = viewWidth - padding * 2;
  const totalMm =
    lites.reduce((sum, l) => sum + Math.max(0, l.thickness), 0) +
    gaps.reduce((sum, g) => sum + Math.max(0, g.width), 0);

  const scale = drawable / Math.max(REFERENCE_SPAN_MM, totalMm);
  const totalPx =
    lites.reduce((sum, l) => sum + Math.max(MIN_PANE_PX, l.thickness * scale), 0) +
    gaps.reduce((sum, g) => sum + Math.max(0, g.width) * scale, 0);

  const panes: PaneLayout[] = [];
  const gapSpans: Layout["gapSpans"] = [];
  let cursor = padding + Math.max(0, (drawable - totalPx) / 2);

  for (const [index, lite] of lites.entries()) {
    const width = Math.max(MIN_PANE_PX, Math.max(0, lite.thickness) * scale);
    panes.push({ x: cursor, width, lite, index });
    cursor += width;

    const gap = gaps[index];
    if (gap) {
      const gapPx = Math.max(0, gap.width) * scale;
      gapSpans.push({ start: cursor, end: cursor + gapPx, width: gap.width });
      cursor += gapPx;
    }
  }

  return { panes, gapSpans };
}

export type DiagramFeature = "coating" | "frit";

export function SurfaceDiagram({
  lites,
  gaps,
  coatingSurface,
  fritSurface,
  onFeatureClick,
  onAddAt,
}: {
  lites: LiteInput[];
  gaps: GapInput[];
  coatingSurface?: SurfaceNumber;
  fritSurface?: SurfaceNumber;
  /** Tapping a feature tag jumps to that feature's card. */
  onFeatureClick?: (feature: DiagramFeature) => void;
  /** When set, bare surfaces grow a + affordance that adds a feature there. */
  onAddAt?: (surface: SurfaceNumber) => void;
}) {
  const { panes, gapSpans } = layout(lites, gaps);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${HEIGHT}`}
        className="mx-auto h-auto max-h-[230px] w-full"
        role="img"
        aria-label={`Cross-section of ${lites.length}-lite glazing, exterior at left`}
      >
        <text x={PADDING} y={16} className="fill-[var(--muted)] text-[9px]" textAnchor="start">
          EXTERIOR
        </text>
        <text
          x={VIEWBOX_WIDTH - PADDING}
          y={16}
          className="fill-[var(--muted)] text-[9px]"
          textAnchor="end"
        >
          INTERIOR
        </text>

        {panes.map(({ x, width, lite, index }) => {
          const outer = (index * 2 + 1) as SurfaceNumber;
          const inner = (index * 2 + 2) as SurfaceNumber;
          return (
            <g key={index}>
              <rect
                x={x}
                y={GLASS_TOP}
                width={width}
                height={GLASS_BOTTOM - GLASS_TOP}
                fill="var(--accent)"
                fillOpacity={0.1}
                stroke="var(--border-strong)"
                strokeWidth={1}
                rx={1}
              />
              <text
                x={x + width / 2}
                y={GLASS_BOTTOM + 20}
                textAnchor="middle"
                className="fill-[var(--muted)] text-[8px]"
              >
                {lite.thickness}mm
              </text>

              {[
                { surface: outer, edgeX: x },
                { surface: inner, edgeX: x + width },
              ].map(({ surface, edgeX }) => (
                <SurfaceMarker
                  key={surface}
                  surface={surface}
                  x={edgeX}
                  hasCoating={coatingSurface === surface}
                  hasFrit={fritSurface === surface}
                  onFeatureClick={onFeatureClick}
                  onAdd={onAddAt ? () => onAddAt(surface) : undefined}
                />
              ))}
            </g>
          );
        })}

        {gapSpans.map((gap, i) => (
          <g key={`gap-${i}`}>
            {/* Dimension line, so the cavity reads as measured rather than blank. */}
            <line
              x1={gap.start + 2}
              y1={GLASS_BOTTOM + 8}
              x2={gap.end - 2}
              y2={GLASS_BOTTOM + 8}
              stroke="var(--border-strong)"
              strokeWidth={0.75}
            />
            <text
              x={(gap.start + gap.end) / 2}
              y={GLASS_BOTTOM + 20}
              textAnchor="middle"
              className="fill-[var(--muted)] text-[8px]"
            >
              {gap.width}mm
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="px-1 pb-0.5 pt-1 text-[11px] text-muted">
        Drawn to scale, numbered from the exterior inward. Tap a tag to edit that feature; tap +
        on a bare surface to add one.
      </figcaption>
    </figure>
  );
}

/**
 * Condensed cross-section for the panel's scrolled state: the same true-scale
 * layout, small enough to sit in a one-line bar. Features keep their colors so
 * the picture stays recognizable; everything else is dropped.
 */
export function MiniSection({
  lites,
  gaps,
  coatingSurface,
  fritSurface,
}: {
  lites: LiteInput[];
  gaps: GapInput[];
  coatingSurface?: SurfaceNumber;
  fritSurface?: SurfaceNumber;
}) {
  const width = 120;
  const { panes } = layout(lites, gaps, width, 6);

  const surfaceX = (surface: SurfaceNumber): number | null => {
    const pane = panes[Math.floor((surface - 1) / 2)];
    if (!pane) return null;
    return surface % 2 === 1 ? pane.x : pane.x + pane.width;
  };

  const coatingX = coatingSurface ? surfaceX(coatingSurface) : null;
  const fritX = fritSurface ? surfaceX(fritSurface) : null;

  return (
    <svg viewBox={`0 0 ${width} 36`} className="h-9 w-auto shrink-0" aria-hidden>
      {panes.map(({ x, width: w }, i) => (
        <rect
          key={i}
          x={x}
          y={3}
          width={w}
          height={30}
          fill="var(--accent)"
          fillOpacity={0.1}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
      ))}
      {coatingX !== null ? (
        <line x1={coatingX} y1={3} x2={coatingX} y2={33} stroke="var(--accent)" strokeWidth={2.5} />
      ) : null}
      {fritX !== null ? (
        <line
          x1={fritX}
          y1={3}
          x2={fritX}
          y2={33}
          stroke="var(--warning)"
          strokeWidth={2.5}
          strokeDasharray="3 2.5"
        />
      ) : null}
    </svg>
  );
}

/** Stack two tags when a coating and frit share a surface. */
function featureTagY(slot: number, shared: boolean): number {
  const mid = (GLASS_TOP + GLASS_BOTTOM) / 2;
  if (!shared) return mid;
  return slot === 0 ? mid - 10 : mid + 10;
}

/**
 * A highlight alone is a private code; the tag says what it marks — and is
 * the tap target that jumps to the feature's card. The pill flips to the left
 * near the right edge so it never leaves the drawing.
 */
function FeatureTag({
  x,
  y,
  text,
  color,
  softColor,
  onClick,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  softColor: string;
  onClick?: () => void;
}) {
  const width = text.length * 5.2 + 12;
  const flip = x > VIEWBOX_WIDTH * 0.72;
  const left = flip ? x - 6 - width : x + 6;

  return (
    <g
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Edit the ${text}` : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      className={onClick ? "cursor-pointer transition-opacity hover:opacity-80" : undefined}
    >
      <rect
        x={left}
        y={y - 7.5}
        width={width}
        height={15}
        rx={7.5}
        fill={softColor}
        stroke={color}
        strokeWidth={0.75}
      />
      <text
        x={left + width / 2}
        y={y + 3}
        textAnchor="middle"
        className="pointer-events-none select-none text-[8px] font-semibold"
        style={{ fill: color }}
      >
        {text}
      </text>
    </g>
  );
}

function SurfaceMarker({
  surface,
  x,
  hasCoating,
  hasFrit,
  onFeatureClick,
  onAdd,
}: {
  surface: SurfaceNumber;
  x: number;
  hasCoating: boolean;
  hasFrit: boolean;
  onFeatureClick?: (feature: DiagramFeature) => void;
  onAdd?: () => void;
}) {
  const occupied = hasCoating || hasFrit;
  const mid = (GLASS_TOP + GLASS_BOTTOM) / 2;

  return (
    <g>
      {hasCoating ? (
        <>
          <line x1={x} y1={GLASS_TOP} x2={x} y2={GLASS_BOTTOM} stroke="var(--accent)" strokeWidth={3} />
          <FeatureTag
            x={x}
            y={featureTagY(0, hasFrit)}
            text="coating"
            color="var(--accent)"
            softColor="var(--accent-soft)"
            onClick={onFeatureClick ? () => onFeatureClick("coating") : undefined}
          />
        </>
      ) : null}
      {hasFrit ? (
        <>
          <line
            x1={x}
            y1={GLASS_TOP}
            x2={x}
            y2={GLASS_BOTTOM}
            stroke="var(--warning)"
            strokeWidth={3}
            strokeDasharray="4 3"
          />
          <FeatureTag
            x={x}
            y={featureTagY(hasCoating ? 1 : 0, hasCoating)}
            text="frit"
            color="var(--warning)"
            softColor="var(--warning-soft)"
            onClick={onFeatureClick ? () => onFeatureClick("frit") : undefined}
          />
        </>
      ) : null}

      {!occupied && onAdd ? (
        <g
          role="button"
          tabIndex={0}
          aria-label={`Add a feature on surface ${surface}`}
          onClick={onAdd}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onAdd();
            }
          }}
          className="cursor-pointer transition-opacity hover:opacity-70"
        >
          <circle
            cx={x}
            cy={mid}
            r={8}
            fill="var(--surface)"
            stroke="var(--border-strong)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
          <text
            x={x}
            y={mid + 3.5}
            textAnchor="middle"
            className="pointer-events-none select-none text-[10px]"
            style={{ fill: "var(--muted)" }}
          >
            +
          </text>
        </g>
      ) : null}

      {/* Leader down to the glass edge, so a number is unambiguous once panes
          sit close together at true scale. */}
      <line
        x1={x}
        y1={GLASS_TOP - 22}
        x2={x}
        y2={GLASS_TOP - 4}
        stroke={occupied ? "var(--accent)" : "var(--border-strong)"}
        strokeWidth={0.75}
      />

      <circle
        cx={x}
        cy={GLASS_TOP - 30}
        r={7.5}
        fill={occupied ? "var(--accent)" : "var(--surface)"}
        stroke={occupied ? "var(--accent)" : "var(--border-strong)"}
        strokeWidth={1}
      />
      <text
        x={x}
        y={GLASS_TOP - 27}
        textAnchor="middle"
        className={`pointer-events-none text-[8px] font-semibold ${
          occupied ? "fill-white" : "fill-[var(--muted)]"
        }`}
      >
        {surface}
      </text>
    </g>
  );
}
