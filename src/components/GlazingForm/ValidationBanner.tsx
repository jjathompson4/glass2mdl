"use client";

import type { SolverWarning, ValidationIssue } from "@/engine";

/** The name field sits back up in card 1, a long scroll from this banner, so
 * the missing-name error carries a jump that also focuses the input.
 *
 * Instant, not smooth: scrolling up re-expands the header's tagline, and that
 * layout shift makes scroll anchoring cancel a smooth animation partway. */
function jumpToName() {
  document.getElementById("card-cutsheet")?.scrollIntoView({ block: "start" });
  document
    .querySelector<HTMLInputElement>('input[aria-label="Product name"]')
    ?.focus({ preventScroll: true });
}

export function ValidationBanner({
  issues,
  warnings,
}: {
  issues: ValidationIssue[];
  warnings: SolverWarning[];
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const cautions = issues.filter((i) => i.severity === "warning");

  if (!errors.length && !cautions.length && !warnings.length) return null;

  return (
    <div className="space-y-2">
      {errors.length ? (
        <Callout tone="danger" title={errors.length === 1 ? "Fix before downloading" : `${errors.length} things to fix before downloading`}>
          {errors.map((issue) => (
            <li key={issue.code + issue.field}>
              {issue.message}
              {issue.code === "name-required" ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={jumpToName}
                    className="font-semibold underline underline-offset-2 transition hover:opacity-80"
                  >
                    Go to the name field
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </Callout>
      ) : null}

      {cautions.length || warnings.length ? (
        <Callout tone="warning" title="Worth knowing">
          {cautions.map((issue) => (
            <li key={issue.code + issue.field}>{issue.message}</li>
          ))}
          {warnings.map((warning) => (
            <li key={warning.code}>{warning.message}</li>
          ))}
        </Callout>
      ) : null}
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "danger" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "border-danger/30 bg-danger-soft text-danger"
      : "border-warning/30 bg-warning-soft text-warning";

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-xs ${styles}`}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed opacity-95">{children}</ul>
    </div>
  );
}
