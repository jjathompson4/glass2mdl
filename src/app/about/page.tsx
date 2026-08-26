import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const metadata: Metadata = {
  title: "About — glass2mdl",
  description:
    "What glass2mdl does: fits render-ready MDL materials for Iray in 3ds Max from the visible-light values on a glazing manufacturer's cutsheet.",
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
        <h1 className="text-xl font-semibold tracking-tight">
          Cutsheet numbers in, render-ready glass out
        </h1>

        <div className="mt-5 space-y-5 text-sm leading-relaxed text-foreground">
          <p>
            Glazing manufacturers publish how a finished assembly performs: the visible
            transmittance and the two reflectances printed on every cutsheet. Renderers want
            something different, which is the optical properties of each surface. Bridging that
            gap by eye produces glass that reads wrong from one side, reflects too much or too
            little, or leaks light the real product would absorb.
          </p>
          <p>
            glass2mdl closes the gap with the actual math. You describe the build-up the way the
            cutsheet does: how many lites, their thickness and substrate, where the coating sits,
            any frit. Then you type the three visible-light values from the performance table.
            The tool solves for per-lite material properties whose rendered assembly, including
            the light bouncing between lites, reproduces your numbers, and it shows you the proof
            before you download.
          </p>

          <h2 className="pt-2 text-sm font-semibold">What you get</h2>
          <p>
            Materials in NVIDIA&apos;s MDL format for Iray for 3ds Max, packaged two ways.{" "}
            <span className="font-medium">Planar geometry</span> gives one material for openings
            modeled as flat planes. <span className="font-medium">Solid lites geometry</span>{" "}
            gives each lite of the IGU its own material with per-face surfaces, so reflections
            stack the way real insulated units do; that ZIP also includes a 3ds Max script that
            finds your glazing, tags its faces, and assigns every material for you.
          </p>

          <h2 className="pt-2 text-sm font-semibold">What it is honest about</h2>
          <p>
            The tool reproduces visible-light appearance for rendering. It is not a substitute
            for thermal or daylight analysis. And because a single transmittance value cannot
            determine a color spectrum, glass color is a physically sensible estimate from your
            substrate choice unless the datasheet publishes color data, which you can enter.
          </p>

          <h2 className="pt-2 text-sm font-semibold">Who made this</h2>
          <p>
            Built by Jeff Thompson, who works in architectural visualization and daylighting and
            wanted glazing in renders to behave like the products being specified. More
            experiments live at{" "}
            <a href="https://thompsonjeff.com" className="text-accent transition hover:opacity-80">
              thompsonjeff.com
            </a>
            . Questions or bugs:{" "}
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
