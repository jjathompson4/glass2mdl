"use client";

import { useState } from "react";
import {
  buildExport,
  litePositionNames,
  luminance,
  type DerivedOptics,
  type ExportBundle,
} from "@/engine";
import { useAppStore } from "@/lib/store";
import { downloadBytes } from "@/lib/download";
import { toDisplay, unitLabel } from "@/lib/units";
import { Section, StepTitle } from "@/components/ui/fields";

/**
 * The last step answers two questions in order: did the numbers work, and
 * what do I get. The verdict leads because a residual is the one thing worth
 * catching before the download; the per-pane decomposition is there for the
 * curious, behind a disclosure, in words rather than symbols.
 */
export function ResultSection({
  derived,
  bundle,
  blocked,
}: {
  derived: DerivedOptics | null;
  bundle: ExportBundle | null;
  blocked: boolean;
}) {
  const system = useAppStore((s) => s.system);
  const mode = useAppStore((s) => s.mode);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string>();

  const handleDownload = () => {
    setError(undefined);
    try {
      const fresh = buildExport(system, mode);
      downloadBytes(fresh.zip, fresh.fileName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export could not be generated.");
    }
  };

  return (
    <Section title={<StepTitle n={5}>Check &amp; download</StepTitle>}>
      {derived ? (
        <FitCheck
          derived={derived}
          assembly={system.assembly}
          showDetails={showDetails}
          onToggleDetails={() => setShowDetails(!showDetails)}
        />
      ) : null}

      {derived && showDetails ? <FitDetails derived={derived} /> : null}

      {bundle ? (
        <ul className="mt-3 space-y-1 rounded-md bg-surface-sunken p-2.5 font-mono text-[11px] text-muted">
          {bundle.files.map((file) => (
            <li key={file.fileName} className="flex justify-between gap-2">
              <span className="truncate text-foreground">{file.fileName}</span>
              <span>{formatBytes(file.bytes.byteLength)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={handleDownload}
        disabled={blocked}
        className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {blocked ? "Fix the errors above to export" : "Download ZIP"}
      </button>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      <p className="mt-2 text-[11px] leading-snug text-muted">
        {mode === "volumetric"
          ? "In 3ds Max, the bundled manifest lets glass2mdl's Max script tag the faces and assign every material automatically. The README covers the manual route."
          : "The README says which material goes on which plane, with face normals pointing outward."}
      </p>
      <p className="mt-1.5 border-t border-border-subtle pt-2 text-[11px] leading-snug text-muted/80">
        In-app preview coming soon.
      </p>
    </Section>
  );
}

const QUANTITIES = [
  { key: "tvis", produced: "t", label: "Transmittance" },
  { key: "rvisExt", produced: "rFront", label: "Reflectance, exterior" },
  { key: "rvisInt", produced: "rBack", label: "Reflectance, interior" },
] as const;

function FitCheck({
  derived,
  assembly,
  showDetails,
  onToggleDetails,
}: {
  derived: DerivedOptics;
  assembly: { tvis: number; rvisExt: number; rvisInt: number };
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  const residual = derived.residual;
  const worst = QUANTITIES.reduce((a, b) =>
    Math.abs(residual[a.key]) >= Math.abs(residual[b.key]) ? a : b,
  );

  // "Exactly" is only claimed when the table visibly agrees at one decimal —
  // a green banner next to 7.9% vs 7.8% reads as a lie even at 0.06 points.
  const displayAgrees = QUANTITIES.every(
    ({ key, produced }) =>
      (assembly[key] * 100).toFixed(1) === (luminance(derived.recomputed[produced]) * 100).toFixed(1),
  );
  const tone =
    residual.max < 0.001 && displayAgrees
      ? {
          box: "border-success/30 bg-success-soft",
          text: "text-success",
          title: "The materials reproduce your numbers exactly",
        }
      : residual.max < 0.02
        ? {
            box: "border-border-subtle bg-surface-sunken",
            text: "text-foreground",
            title: `Within ${(residual.max * 100).toFixed(1)}% of intended values`,
          }
        : {
            box: "border-warning/30 bg-warning-soft",
            text: "text-warning",
            title: `Closest match is ${(Math.abs(residual[worst.key]) * 100).toFixed(1)}% off on ${worst.label.toLowerCase()}`,
          };

  return (
    <div className={`rounded-md border p-3 ${tone.box}`}>
      <div className="flex items-start gap-2.5">
        {residual.max < 0.001 && displayAgrees ? <CheckIcon /> : residual.max >= 0.02 ? <WarnIcon /> : null}
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold ${tone.text}`}>{tone.title}</p>

          <div className="mt-2 grid max-w-sm grid-cols-[1fr_76px_76px] gap-x-3 gap-y-1 text-xs text-muted">
            <span />
            <span className="font-medium">entered</span>
            <span className="font-medium">produced</span>
            {QUANTITIES.map(({ key, produced, label }) => {
              const off = Math.abs(residual[key]) >= 0.02;
              return (
                <FitRow
                  key={key}
                  label={label}
                  entered={assembly[key]}
                  produced={luminance(derived.recomputed[produced])}
                  highlight={off}
                />
              );
            })}
          </div>

          {residual.max >= 0.02 ? (
            <p className="mt-2 text-xs leading-snug text-muted">
              The fit returns the closest achievable values instead. Usually this means the entered
              numbers belong to a different construction. Check the lite count, the coated surface,
              and the substrate tints against the cutsheet.
            </p>
          ) : null}

          <button
            type="button"
            onClick={onToggleDetails}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted transition hover:text-foreground"
          >
            <svg
              viewBox="0 0 12 12"
              className={`h-3 w-3 transition-transform ${showDetails ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden
            >
              <path d="M4 2.5 L8 6 L4 9.5" />
            </svg>
            How the numbers were split across the lites
          </button>
        </div>
      </div>
    </div>
  );
}

function FitRow({
  label,
  entered,
  produced,
  highlight,
}: {
  label: string;
  entered: number;
  produced: number;
  highlight: boolean;
}) {
  const cls = highlight ? "text-warning" : "";
  return (
    <>
      <span className={cls}>{label}</span>
      <span className={`tabular-nums ${cls}`}>{(entered * 100).toFixed(1)}%</span>
      <span className={`tabular-nums ${highlight ? "font-semibold text-warning" : "text-foreground"}`}>
        {(produced * 100).toFixed(1)}%
      </span>
    </>
  );
}

function FitDetails({ derived }: { derived: DerivedOptics }) {
  const lites = useAppStore((s) => s.system.lites);
  const unit = useAppStore((s) => s.unit);
  const positions = litePositionNames(lites.length);
  const coating = derived.coating;
  const exampleSigma = luminance(derived.lites[0].absorptionCoefficient);
  const exampleThickness = lites[0].thickness;
  const examplePct = (1 - Math.exp(-exampleSigma * (exampleThickness / 1000))) * 100;
  const exampleLabel = `${toDisplay(exampleThickness, unit)}${unitLabel(unit)}`;

  return (
    <div className="mt-2 rounded-md border border-border-subtle p-3">
      <p className="text-xs leading-snug text-muted">
        One set of assembly numbers becomes per-lite properties. These are the values baked into
        each downloaded material:
      </p>

      <div className="mt-2 grid grid-cols-[96px_1fr_86px] gap-x-3 gap-y-1.5 border-t border-border-subtle pt-2 text-xs">
        <span />
        <span />
        <span className="font-medium text-muted/80">absorption</span>
        {derived.lites.map((lite, i) => {
          const isCoated = coating && Math.floor((coating.surface - 1) / 2) === i;
          return (
            <LiteRow
              key={lite.index}
              name={`Lite ${i + 1} · ${positions[i]}`}
              text={`${isCoated ? "coated" : "bare glass"}, body passes ${(luminance(lite.internalTransmittance) * 100).toFixed(0)}%`}
              sigma={luminance(lite.absorptionCoefficient)}
            />
          );
        })}
        {coating ? (
          <>
            <span className="font-medium text-foreground">Coating · #{coating.surface}</span>
            <span className="text-muted">
              transmits {(luminance(coating.transmission) * 100).toFixed(0)}% · reflects{" "}
              {(luminance(coating.reflectanceExt) * 100).toFixed(0)}% out /{" "}
              {(luminance(coating.reflectanceInt) * 100).toFixed(0)}% in
            </span>
            <span />
          </>
        ) : null}
      </div>

      <p className="mt-2 border-t border-border-subtle pt-2 text-[11px] leading-snug text-muted/80">
        Absorption is how strongly the glass body soaks up light per meter traveled:{" "}
        {exampleSigma.toFixed(1)} /m across a {exampleLabel} lite absorbs about{" "}
        {examplePct.toFixed(0)}%. It is the value baked into each solid material&apos;s
        volume; a coated lite&apos;s download folds the coating&apos;s absorption in as well.
      </p>
    </div>
  );
}

function LiteRow({ name, text, sigma }: { name: string; text: string; sigma: number }) {
  return (
    <>
      <span className="font-medium text-foreground">{name}</span>
      <span className="text-muted">{text}</span>
      <span className="font-mono tabular-nums text-muted">{sigma.toFixed(1)} /m</span>
    </>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 18 18" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="9" cy="9" r="7.25" strokeWidth={1.5} />
      <path d="M5.5 9.2 L8 11.7 L12.5 6.7" strokeWidth={2} />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 18 18" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M9 2.5 L16.2 15 L1.8 15 Z" />
      <line x1="9" y1="7" x2="9" y2="10.5" strokeWidth={2} />
      <circle cx="9" cy="13" r="0.5" fill="currentColor" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
