import Link from "next/link";
import { GlazingForm } from "@/components/GlazingForm/GlazingForm";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MDL_VERSION } from "@/engine";

export default function Home() {
  return (
    <div className="min-h-screen">
      <header id="site-header" className="sticky top-0 z-40 border-b border-border-subtle bg-surface">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-5 py-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight">glass2mdl</h1>
            <p className="mt-0.5 text-xs text-muted">
              Turn manufacturer glazing data into MDL materials for Iray in 3ds Max.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/about" className="text-xs text-muted transition hover:text-foreground">
              About
            </Link>
            <span className="hidden font-mono text-[11px] text-muted sm:block">
              MDL {MDL_VERSION}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        <GlazingForm />
      </main>

      <SiteFooter />
    </div>
  );
}
