import Link from "next/link";

const linkClass = "text-accent transition hover:opacity-80";

export function SiteFooter({ showAbout = true }: { showAbout?: boolean }) {
  return (
    <footer className="mt-auto border-t border-border-subtle px-5 py-5">
      <div className="mx-auto flex max-w-[820px] flex-col items-center gap-1.5 text-center text-xs text-muted">
        <p>
          For rendering and visualization only, not for thermal or annual daylight analysis.
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
          Questions or bugs:{" "}
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
