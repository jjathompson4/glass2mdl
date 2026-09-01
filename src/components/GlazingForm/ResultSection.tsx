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
import { ActionButton, Section } from "@/components/ui/fields";
import { VerdictChip } from "./DiagramPanel";
import { FIT_QUANTITIES, fitVerdict } from "./fitVerdict";

/**
 * The verdict itself lives in the diagram panel, always visible; this card
 * answers "what do I get", with the full entered-versus-produced table and
 * the per-lite split behind one disclosure for anyone who wants the receipts.
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

  const assemblyEdited = useAppStore((s) => s.assemblyEdited);
  const verdict = derived ? fitVerdict(derived, system.assembly) : null;

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
    <Section id="card-download" title="Download">
      {derived && verdict ? (
        <div className="rounded-md border border-border-subtle p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[13px] font-medium text-foreground">Fit check</p>
              <VerdictChip verdict={verdict} estimated={!assemblyEdited} />
            </div>
            <ActionButton onClick={() => setShowDetails(!showDetails)} active={showDetails}>
              {showDetails ? "Done" : "Details…"}
            </ActionButton>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted">
            This app is solving for per-lite material properties based on the data you enter
            from the glazing data sheet. Any discrepancies will be visible here.
          </p>
          {showDetails ? (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <FitTable derived={derived} assembly={system.assembly} />
              <FitDetails derived={derived} />
            </div>
          ) : null}
        </div>
      ) : null}

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
        {blocked ? "Fix the errors above to download" : "Download ZIP"}
      </button>

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      <p className="mt-2 text-[11px] leading-snug text-muted">
        The README says which material goes on which plane, with face normals pointing outward.
        If working with solid lite geometry, use the Python script included in the ZIP file to
        automate material assignments.
      </p>
      <p className="mt-1.5 border-t border-border-subtle pt-2 text-[11px] leading-snug text-muted/80">
        In-app preview coming soon.
      </p>
    </Section>
  );
}

function FitTable({
  derived,
  assembly,
}: {
  derived: DerivedOptics;
  assembly: { tvis: number; rvisExt: number; rvisInt: number };
}) {
  const residual = derived.residual;
  const anyOff = residual.max >= 0.02;

  return (
    <div>
      <div className="grid max-w-sm grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs text-muted sm:grid-cols-[1fr_76px_76px]">
        <span />
        <span className="font-medium">entered</span>
        <span className="font-medium">produced</span>
        {FIT_QUANTITIES.map(({ key, produced, label }) => {
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

      {anyOff ? (
        <p className="mt-2 text-xs leading-snug text-muted">
          The fit returns the closest achievable values instead. Usually this means the entered
          numbers belong to a different construction. Check the lite count, the coated surface,
          and the substrate tints against the data sheet.
        </p>
      ) : null}
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
  const spandrel = useAppStore((s) => s.system.spandrel);
  const unit = useAppStore((s) => s.unit);
  const positions = litePositionNames(lites.length);
  const coating = derived.coating;
  const exampleSigma = luminance(derived.lites[0].absorptionCoefficient);
  const exampleThickness = lites[0].thickness;
  const examplePct = (1 - Math.exp(-exampleSigma * (exampleThickness / 1000))) * 100;
  const exampleLabel = `${toDisplay(exampleThickness, unit)}${unitLabel(unit)}`;

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <p className="text-xs leading-snug text-muted">
        One set of assembly numbers becomes per-lite properties. These are the values baked into
        each downloaded material:
      </p>

      <div className="mt-2 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1.5 border-t border-border-subtle pt-2 text-xs sm:grid-cols-[96px_1fr_86px]">
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
        {spandrel && derived.spandrel ? (
          <>
            <span className="font-medium text-foreground">
              {spandrel.kind === "flood-coat" ? `Flood coat · #${spandrel.surface}` : "Back pan"}
            </span>
            <span className="text-muted">
              opaque · reads as {(luminance(derived.spandrel.readsAs) * 100).toFixed(1)}% from
              outside, glass alone {(luminance(derived.spandrel.glassOnly) * 100).toFixed(1)}%
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
