import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const metadata: Metadata = {
  title: "About · glass2mdl",
  description:
    "What glass2mdl does: fits render-ready MDL materials for Iray in 3ds Max from the visible-light values on a glazing manufacturer's data sheet.",
};

export default function About() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border-subtle bg-surface">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-5 py-4">
          <Link href="/" className="text-base font-semibold tracking-tight transition hover:opacity-80">
            glass2mdl
          </Link>
          <span className="text-xs text-muted">About</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-8">
        <h1 className="text-base font-semibold">
          Simulation-ready glazing materials, based on manufacturer data
        </h1>

        <div className="mt-5 space-y-5 text-sm leading-relaxed text-foreground">
          <p>
            glass2mdl turns the numbers on a glazing manufacturer&apos;s datasheet into MDL
            materials for Iray in 3ds Max. Glazing materials created with this tool transmit,
            reflect, and absorb exactly the amount of light that the datasheet describes, and
            it looks physically correct from both sides. Coated products keep their asymmetric
            reflections. The fit check shows you the proof before you download.
          </p>
          <p>
            You build the configuration exactly as the datasheet describes (lites, thicknesses,
            substrates, coating placement, any frit) and type the three visible light values
            from the performance table. The tool solves for per-lite material properties whose
            rendered assembly, including the light bouncing between lites, reproduces those
            numbers.
          </p>

          <h2 className="pt-2 text-base font-semibold">Outputs</h2>
          <p>
            <span className="font-medium">Planar geometry</span>: one material for openings
            modeled as flat planes.
          </p>
          <p>
            <span className="font-medium">Solid lites geometry</span>: each lite as a real
            solid with per-face surfaces, so reflections stack the way real insulated units
            do. That ZIP includes a 3ds Max script that finds your glazing, tags its faces,
            and assigns every material for you.
          </p>

          <h2 className="pt-2 text-base font-semibold">Honesty</h2>
          <p>
            This is visible-light appearance for rendering and point-in-time calculations, not
            thermal or annual daylight analysis. Glass color is a physically sensible estimate
            from your substrate choice unless the datasheet publishes color data, which you
            can enter.
          </p>

          <h2 className="pt-2 text-base font-semibold">Built by</h2>
          <p>
            Jeff has 10 years of experience in lighting design, architectural visualization,
            and daylight analysis. More experiments at{" "}
            <a href="https://thompsonjeff.com" className="text-accent transition hover:opacity-80">
              thompsonjeff.com
            </a>
            ; questions or bugs to{" "}
            <a href="mailto:jt@thompsonjeff.com" className="text-accent transition hover:opacity-80">
              jt@thompsonjeff.com
            </a>
            .
          </p>

          <p className="pt-2">
            <Link
              href="/"
              className="font-medium text-accent transition hover:opacity-80"
            >
              Open the tool
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter showAbout={false} />
    </div>
  );
}
