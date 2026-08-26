"use client";

import type { SolverWarning, ValidationIssue } from "@/engine";

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
            <li key={issue.code + issue.field}>{issue.message}</li>
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
