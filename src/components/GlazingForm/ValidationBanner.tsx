"use client";

import type { SolverWarning, ValidationIssue } from "@/engine";

/** Smooth scroll the window toward a target that may move. Scrolling up
 * re-expands the header's tagline, and that layout shift makes the browser
 * cancel its own smooth scrollIntoView via scroll anchoring — so this drives
 * the animation frame by frame, re-reading the target as layout shifts.
 * Real user input (wheel, touch) hands control back immediately. */
function animateScrollTo(target: () => number) {
  let raf = 0;
  let last = performance.now();
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  const step = (now: number) => {
    const dt = Math.min(64, now - last);
    last = now;
    const remaining = target() - window.scrollY;
    if (Math.abs(remaining) <= 1) {
      window.scrollTo(0, target());
      stop();
      return;
    }
    // Exponential approach; dt-scaled so the pace survives dropped frames.
    window.scrollBy(0, remaining * (1 - Math.exp(-dt / 100)));
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/** The name field sits in step 1, which may be a long scroll (phone) or in
 * the other pane (desktop) from whatever asked for it, so the jump both
 * scrolls there and focuses the input. */
export function jumpToName() {
  const card = document.getElementById("card-cutsheet");
  if (!card) return;
  document
    .querySelector<HTMLInputElement>('input[aria-label="Product name"]')
    ?.focus({ preventScroll: true });
  // On the desktop layout the form scrolls inside its own pane and the window
  // never moves, so the browser's own scrollIntoView is safe there.
  if (window.matchMedia("(min-width: 1024px)").matches) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  // 128px clears the sticky header + condensed bar (the cards' scroll-mt-32).
  animateScrollTo(() => Math.max(0, window.scrollY + card.getBoundingClientRect().top - 128));
}

export function ValidationBanner({
  issues,
  warnings,
}: {
  issues: ValidationIssue[];
  warnings: SolverWarning[];
}) {
  // A missing name is asked for in the download slot, not shouted here: on a
  // first visit nothing has gone wrong yet.
  const errors = issues.filter((i) => i.severity === "error" && i.code !== "name-required");
  const cautions = issues.filter((i) => i.severity === "warning");

  if (!errors.length && !cautions.length && !warnings.length) return null;

  return (
    <div className="space-y-2">
      {errors.length ? (
        <Callout tone="danger" title={errors.length === 1 ? "Fix before downloading" : `${errors.length} things to fix before downloading`}>
          {errors.map((issue) => (
            <li key={issue.code + issue.field}>
              {issue.message}
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
    <div className={`rounded-lg border px-3 py-2.5 text-[13px] ${styles}`}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed opacity-95">{children}</ul>
    </div>
  );
}
