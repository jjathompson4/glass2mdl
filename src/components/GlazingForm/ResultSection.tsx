"use client";

import { useState } from "react";
import { buildExport, type DerivedOptics, type ExportBundle } from "@/engine";
import { useAppStore } from "@/lib/store";
import { downloadBytes } from "@/lib/download";
import { ActionButton, Section } from "@/components/ui/fields";
import { VerdictChip } from "./DiagramPanel";
import { FitLinePanel } from "./FitLinePanel";
import { fitVerdict } from "./fitVerdict";
import { jumpToName } from "./ValidationBanner";

/**
 * What you get: the file list and the one button. A glazing with no name yet
 * is not an error to shout about on a first visit, so the slot simply asks
 * for the name and offers to take you to the field.
 */
export function DownloadBlock({
  bundle,
  blocked,
}: {
  bundle: ExportBundle | null;
  blocked: boolean;
}) {
  const system = useAppStore((s) => s.system);
  const mode = useAppStore((s) => s.mode);
  const [error, setError] = useState<string>();
  const nameMissing = system.name.trim() === "";

  const handleDownload = () => {
    setError(undefined);
    try {
      const fresh = buildExport(system, mode);
      downloadBytes(fresh.zip, fresh.fileName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export could not be generated.");
    }
  };

  if (nameMissing) {
    return (
      <div className="flex h-full flex-col justify-between gap-3">
        <p className="text-sm leading-snug text-muted">
          Give the glazing a name to build the files. It becomes the material and file name.
        </p>
        <button
          type="button"
          onClick={jumpToName}
          className="h-12 w-full rounded-[10px] border border-accent text-base font-semibold text-accent transition hover:bg-accent-soft"
        >
          Name the glazing
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between gap-3">
      {bundle ? (
        <ul className="space-y-0.5 font-mono text-xs text-muted">
          {bundle.files.map((file) => (
            <li key={file.fileName} className="flex justify-between gap-3">
              <span className="truncate text-foreground">{file.fileName}</span>
              <span className="shrink-0">{formatBytes(file.bytes.byteLength)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-snug text-muted">
          The files are built once the items listed under the form are fixed.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={blocked}
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] bg-accent text-base font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
            <path d="M9 2.5 V11.5 M5 8 L9 12 L13 8 M3 15 H15" />
          </svg>
          {blocked ? "Fix the errors to download" : "Download ZIP"}
        </button>
        {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
        <p className="mt-2 text-[13px] leading-snug text-muted">
          The README inside says which material goes on which face. For solid lites, the included
          Python script assigns them for you.
        </p>
      </div>
    </div>
  );
}

/**
 * The phone layout's closing card. On a desktop the result pane carries all
 * of this beside the form instead.
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
  const assembly = useAppStore((s) => s.system.assembly);
  const assemblyEdited = useAppStore((s) => s.assemblyEdited);
  const [showDetails, setShowDetails] = useState(false);
  const verdict = derived ? fitVerdict(derived, assembly) : null;

  return (
    <Section id="card-download" title="Download">
      {derived && verdict ? (
        <div className="mb-4 rounded-[10px] border border-border-subtle p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[15px] font-medium text-foreground">Fit check</p>
              <VerdictChip verdict={verdict} estimated={!assemblyEdited} />
            </div>
            <ActionButton onClick={() => setShowDetails(!showDetails)} active={showDetails}>
              {showDetails ? "Done" : "How the fit gets there"}
            </ActionButton>
          </div>
          {showDetails ? (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <FitLinePanel derived={derived} />
            </div>
          ) : null}
        </div>
      ) : null}

      <DownloadBlock bundle={bundle} blocked={blocked} />
    </Section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
