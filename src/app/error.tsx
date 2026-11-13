"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/**
 * The solver runs during render, so an input it cannot handle would otherwise
 * leave a blank page. Nothing is stored between visits: "Start over" reloads
 * with the default glazing, "Try again" re-renders with what was entered.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[520px] flex-col justify-center gap-4 px-5 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Something went wrong building this glazing
      </h1>
      <p className="text-[15px] leading-relaxed text-muted">
        The tool hit an input it could not work with. Nothing you entered has been sent anywhere.
        Try again, or start over with the default glazing.
      </p>
      {error instanceof Error && error.message ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 font-mono text-[13px] text-muted">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => retry()}
          className="h-11 rounded-[10px] bg-accent px-5 text-[15px] font-semibold text-white transition hover:opacity-90"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-[10px] border border-border-strong px-5 text-[15px] font-medium text-foreground transition hover:border-accent hover:text-accent"
        >
          Start over
        </button>
      </div>
      <p className="text-[13px] text-muted">
        If it keeps happening, tell me what you entered:{" "}
        <a href="mailto:jt@thompsonjeff.com" className="text-accent hover:opacity-80">
          jt@thompsonjeff.com
        </a>
      </p>
    </main>
  );
}
