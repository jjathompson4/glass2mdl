import Link from "next/link";
import { GlazingForm } from "@/components/GlazingForm/GlazingForm";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MDL_VERSION } from "@/engine";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <header
        id="site-header"
        className="sticky top-0 z-40 shrink-0 border-b border-border-subtle bg-surface lg:static"
      >
        <div className="mx-auto flex h-14 max-w-[820px] items-center justify-between gap-4 px-4 sm:px-5 lg:max-w-none lg:px-7">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
            <h1 className="text-lg font-semibold tracking-tight">glass2mdl</h1>
            <p className="hidden truncate text-sm text-muted md:block">
              Turn manufacturer glazing data into MDL materials for Iray in 3ds Max.
            </p>
            {/* Same badge as pbr2rad.com: these are working tools, still being proven. */}
            <span className="shrink-0 rounded-full border border-warning px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-warning">
              Experimental
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden text-[13px] text-muted xl:inline">
              MDL {MDL_VERSION}, Iray+ 3.1 for 3ds Max 2024
            </span>
            {/* Phones reach About from the footer; the header has no room beside the badge. */}
            <Link href="/about" className="hidden text-sm text-muted transition hover:text-foreground sm:inline">
              About
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="lg:min-h-0 lg:flex-1">
        <GlazingForm />
      </main>

      <div className="pb-20 lg:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}
