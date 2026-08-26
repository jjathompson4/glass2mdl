"use client";

import type { GapInput, LiteInput, SurfaceNumber } from "@/engine";

/**
 * Cross-section through the glazing, exterior on the left.
 *
 * Cutsheets identify coatings by surface number, and mixing up #2 and #3 puts
 * a coating in the wrong cavity. Drawing the build-up with every feature
 * highlighted and labeled in place lets the surface dropdowns be verified at
 * a glance.
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
function layout(lites: LiteInput[], gaps: GapInput[]): Layout {
  const drawable = VIEWBOX_WIDTH - PADDING * 2;
  const totalMm =
    lites.reduce((sum, l) => sum + Math.max(0, l.thickness), 0) +
    gaps.reduce((sum, g) => sum + Math.max(0, g.width), 0);

  const scale = drawable / Math.max(REFERENCE_SPAN_MM, totalMm);
  const totalPx =
    lites.reduce((sum, l) => sum + Math.max(MIN_PANE_PX, l.thickness * scale), 0) +
    gaps.reduce((sum, g) => sum + Math.max(0, g.width) * scale, 0);

  const panes: PaneLayout[] = [];
  const gapSpans: Layout["gapSpans"] = [];
  let cursor = PADDING + Math.max(0, (drawable - totalPx) / 2);

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

export function SurfaceDiagram({
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
  const { panes, gapSpans } = layout(lites, gaps);

  return (
    <figure className="rounded-md border border-border-subtle bg-surface-sunken p-2">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
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
        Drawn to scale. Surfaces are numbered from the exterior inward, and every feature is
        labeled where it sits.
      </figcaption>
    </figure>
  );
}

/** Stack two labels when a coating and frit share a surface. */
function featureLabelY(slot: number, shared: boolean): number {
  const mid = (GLASS_TOP + GLASS_BOTTOM) / 2;
  if (!shared) return mid + 3;
  return slot === 0 ? mid - 6 : mid + 12;
}

/**
 * A highlight alone is a private code; the label says what it marks. Text
 * flips to the left near the right edge so it never leaves the drawing.
 */
function FeatureLabel({ x, y, text, fill }: { x: number; y: number; text: string; fill: string }) {
  const flip = x > VIEWBOX_WIDTH * 0.72;
  return (
    <text
      x={flip ? x - 5 : x + 5}
      y={y}
      textAnchor={flip ? "end" : "start"}
      className="pointer-events-none text-[8px] font-semibold"
      style={{ fill }}
    >
      {text}
    </text>
  );
}

function SurfaceMarker({
  surface,
  x,
  hasCoating,
  hasFrit,
}: {
  surface: SurfaceNumber;
  x: number;
  hasCoating: boolean;
  hasFrit: boolean;
}) {
  const occupied = hasCoating || hasFrit;

  return (
    <g>
      {hasCoating ? (
        <>
          <line x1={x} y1={GLASS_TOP} x2={x} y2={GLASS_BOTTOM} stroke="var(--accent)" strokeWidth={3} />
          <FeatureLabel x={x} y={featureLabelY(0, hasFrit)} text="coating" fill="var(--accent)" />
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
          <FeatureLabel x={x} y={featureLabelY(hasCoating ? 1 : 0, hasCoating)} text="frit" fill="var(--warning)" />
        </>
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
