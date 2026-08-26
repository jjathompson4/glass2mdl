"use client";

import {
  SUBSTRATE_INTERNAL_T_6MM,
  linearRGBToHex,
  type GapInput,
  type LiteInput,
  type SurfaceNumber,
} from "@/engine";

/**
 * Cross-section through the glazing, exterior on the left.
 *
 * Cutsheets identify coatings by surface number, and mixing up #2 and #3 puts
 * a coating in the wrong cavity. Drawing the build-up with every feature
 * tagged in place lets the surface dropdowns be verified at a glance — and
 * since the diagram is pinned while the cards scroll, the tags double as
 * navigation: tapping one jumps to that feature's card.
 */

const VIEWBOX_WIDTH = 500;
const HEIGHT = 190;
const GLASS_TOP = 52;
const GLASS_BOTTOM = 152;
const PADDING = 26;

/**
 * Millimetres of build-up the drawing is sized around — a generous triple
 * (6 + 12 + 6 + 12 + 6 = 42mm) plus room for the add-lite ghost and the
 * mid-height EXTERIOR/INTERIOR labels beside the glass.
 *
 * The scale is fixed against this rather than stretched to fill the width, so
 * a 6mm lite is drawn the same width whether it stands alone or sits in a
 * triple. Fitting to width made a monolithic lite look ten times thicker than
 * the identical lite in an IGU, which reads as the glass having changed.
 */
const REFERENCE_SPAN_MM = 68;

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
  /** Dashed add-a-lite slot drawn one nominal gap after the last pane. */
  ghost: { x: number; width: number } | null;
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
  withGhost = false,
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

  // The ghost is an affordance, not geometry: it hangs a fixed 14px off the
  // right of the centered build-up so the real lites never shift to make
  // room for it.
  const ghost = withGhost
    ? { x: cursor + 14, width: Math.max(MIN_PANE_PX, 6 * scale) }
    : null;

  return { panes, gapSpans, ghost };
}

export type DiagramFeature = "coating" | "frit";

/**
 * Panes are filled with their substrate's own transmitted color, so a green
 * or bronze lite reads as such at a glance and a mixed build-up is visibly
 * mixed. Drawn at half opacity over the panel surface so it works on both
 * themes.
 */
function substrateHex(lite: LiteInput): string {
  return linearRGBToHex(SUBSTRATE_INTERNAL_T_6MM[lite.substrate]);
}

export function SurfaceDiagram({
  lites,
  gaps,
  coatingSurface,
  fritSurface,
  onFeatureClick,
  onAddAt,
  onAddLite,
}: {
  lites: LiteInput[];
  gaps: GapInput[];
  coatingSurface?: SurfaceNumber;
  fritSurface?: SurfaceNumber;
  /** Tapping a feature tag jumps to that feature's card. */
  onFeatureClick?: (feature: DiagramFeature) => void;
  /** When set, bare surfaces grow a + affordance that adds a feature there. */
  onAddAt?: (surface: SurfaceNumber) => void;
  /** When set, a dashed ghost pane after the last lite adds one on click. */
  onAddLite?: () => void;
}) {
  const { panes, gapSpans, ghost } = layout(
    lites,
    gaps,
    VIEWBOX_WIDTH,
    PADDING,
    Boolean(onAddLite),
  );

  // A coating and a frit facing each other across one cavity (surfaces k and
  // k+1 with k even) would meet at the same mid-height; nudge them apart.
  const facingAcrossCavity =
    coatingSurface !== undefined &&
    fritSurface !== undefined &&
    Math.abs(coatingSurface - fritSurface) === 1 &&
    Math.min(coatingSurface, fritSurface) % 2 === 0;
  const nudgeFor = (surface: SurfaceNumber): number =>
    facingAcrossCavity && (surface === coatingSurface || surface === fritSurface)
      ? surface % 2 === 0
        ? -10
        : 10
      : 0;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${HEIGHT}`}
        className="mx-auto h-auto max-h-[230px] w-full"
        role="img"
        aria-label={`Cross-section of ${lites.length}-lite glazing, exterior at left`}
      >
        {/* Mid-height side labels; the reference span leaves room for them
            beside the widest build-up plus the add-lite ghost. */}
        <text
          x={6}
          y={(GLASS_TOP + GLASS_BOTTOM) / 2 + 3}
          className="fill-[var(--muted)] text-[9px]"
          textAnchor="start"
        >
          EXTERIOR
        </text>
        <text
          x={VIEWBOX_WIDTH - 6}
          y={(GLASS_TOP + GLASS_BOTTOM) / 2 + 3}
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
                fill={substrateHex(lite)}
                fillOpacity={0.5}
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
                  yNudge={nudgeFor(surface)}
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

        {ghost && onAddLite ? (
          <g
            role="button"
            tabIndex={0}
            aria-label="Add a lite"
            onClick={onAddLite}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onAddLite();
              }
            }}
            className="cursor-pointer opacity-60 outline-none transition-opacity hover:opacity-100 focus:outline-none"
          >
            <rect
              x={ghost.x}
              y={GLASS_TOP}
              width={ghost.width}
              height={GLASS_BOTTOM - GLASS_TOP}
              fill="var(--surface)"
              fillOpacity={0.01}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="4 3"
              rx={1}
              style={{ pointerEvents: "all" }}
            />
            <text
              x={ghost.x + ghost.width / 2}
              y={(GLASS_TOP + GLASS_BOTTOM) / 2 + 3.5}
              textAnchor="middle"
              className="pointer-events-none select-none text-[10px]"
              style={{ fill: "var(--muted)" }}
            >
              +
            </text>
            <text
              x={ghost.x + ghost.width / 2}
              y={GLASS_BOTTOM + 20}
              textAnchor="middle"
              className="pointer-events-none select-none fill-[var(--muted)] text-[8px]"
            >
              add lite
            </text>
          </g>
        ) : null}
      </svg>

      <figcaption className="px-1 pb-0.5 pt-1 text-[11px] text-muted">
        Drawn to scale, numbered from the exterior inward. Click a tag to edit a feature, or +
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
      {panes.map(({ x, width: w, lite }, i) => (
        <rect
          key={i}
          x={x}
          y={3}
          width={w}
          height={30}
          fill={substrateHex(lite)}
          fillOpacity={0.5}
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
  side,
  onClick,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  softColor: string;
  /** Which side of the surface the pill sits on: always AWAY from the glass,
   * so a tag never covers its own lite or the next surface's + target. */
  side: "left" | "right";
  onClick?: () => void;
}) {
  const width = text.length * 5.2 + 12;
  const left = side === "left" ? x - 6 - width : x + 6;

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
      className={
        onClick
          ? "cursor-pointer outline-none transition-opacity hover:opacity-80 focus:outline-none"
          : undefined
      }
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
  yNudge,
  onFeatureClick,
  onAdd,
}: {
  surface: SurfaceNumber;
  x: number;
  hasCoating: boolean;
  hasFrit: boolean;
  /** Vertical shift applied when this tag shares a cavity with a facing tag. */
  yNudge: number;
  onFeatureClick?: (feature: DiagramFeature) => void;
  onAdd?: () => void;
}) {
  const occupied = hasCoating || hasFrit;
  const mid = (GLASS_TOP + GLASS_BOTTOM) / 2;
  // Odd surfaces are lite LEFT edges (glass to the right), even surfaces are
  // lite RIGHT edges (glass to the left): the tag points the other way.
  const tagSide: "left" | "right" = surface % 2 === 1 ? "left" : "right";

  return (
    <g>
      {hasCoating ? (
        <>
          <line x1={x} y1={GLASS_TOP} x2={x} y2={GLASS_BOTTOM} stroke="var(--accent)" strokeWidth={3} />
          <FeatureTag
            x={x}
            y={featureTagY(0, hasFrit) + yNudge}
            text="coating"
            color="var(--accent)"
            softColor="var(--accent-soft)"
            side={tagSide}
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
            y={featureTagY(hasCoating ? 1 : 0, hasCoating) + yNudge}
            text="frit"
            color="var(--warning)"
            softColor="var(--warning-soft)"
            side={tagSide}
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
          className="cursor-pointer outline-none transition-opacity hover:opacity-70 focus:outline-none"
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
