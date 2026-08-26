import Link from "next/link";

const linkClass = "text-accent transition hover:opacity-80";

export function SiteFooter({ showAbout = true }: { showAbout?: boolean }) {
  return (
    <footer className="mt-auto border-t border-border-subtle px-5 py-5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 text-xs text-muted">
        <p>
          Reproduces visible-light appearance for rendering. Not a substitute for thermal or
          daylight analysis.
        </p>
        <p>
          {showAbout ? (
            <>
              <Link href="/about" className={linkClass}>
                About
              </Link>
              <span> · </span>
            </>
          ) : null}
          Built by Jeff Thompson · Questions or bugs:{" "}
          <a href="mailto:jt@thompsonjeff.com" className={linkClass}>
            jt@thompsonjeff.com
          </a>
          {" "}· More experiments at{" "}
          <a href="https://thompsonjeff.com" className={linkClass}>
            thompsonjeff.com
          </a>
        </p>
      </div>
    </footer>
  );
}
