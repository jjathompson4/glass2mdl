# glass2mdl

Turn manufacturer glazing performance data into NVIDIA MDL materials for Iray in
3ds Max.

> Picking this project back up? Start with [`HANDOFF.md`](HANDOFF.md) — current
> status, the one decision blocking further work, and what still needs deciding.

Enter what the cutsheet reports — visible transmittance, exterior and interior
reflectance, measured colour, the build-up, the coated surface — and download a
ZIP holding the `.mdl` module, any frit textures, and a README saying which
material goes on which pane.

Handles single, double, and triple IGUs; low-e, reflective, and other coatings;
clear, low-iron, green, gray, bronze, and blue substrates; frit as dots,
lines, an uploaded coverage map, or plain coverage; and spandrels — the same
glass with an opaque flood coat on the back of a lite, or a painted or
metallic back pan behind an air cavity. A spandrel has no data sheet of its
own: the glass is fitted as vision glass, the finish colour is taken as given
(by RAL number, chart, or sample), and the tool reports what the panel reads
as from outside through that glass.

Colour can be given as CIELAB under D65 (what technical documents publish), CIE
x,y chromaticity, or a swatch eyedropped from a product sheet. Measured colour
sets hue while the performance values set level, so a cutsheet's own numbers
replace the nominal substrate guess. Because L\* encodes lightness too, it is
cross-checked against the transmittance entered beside it.

## Export modes

**Planar** — the whole assembly as one thin-walled material for a flat surface
with no thickness. The measured numbers already include every internal
reflection, so they are reproduced directly, and the interior side gets its own
reflectance through MDL's `backface`.

**Volumetric** — one material per lite, for panes modeled as solids. Glass
colour comes from volume absorption, light travels through the gaps, and
reflections stack the way real IGUs do. Frit exports as a separate decal
material for a plane at the surface it belongs on.

> A coated lite exports as a per-face Material-ID assembly — Iray ignores
> `backface` on solids but honors Material IDs (render-validated, see
> [`docs/iray-findings.md`](docs/iray-findings.md)). Its material carries an
> `interior_face` switch and goes on face IDs 1 (exterior), 2 (interior, switch
> on), and 3 (edges) via a Multi-Sub-Object. The bundled `bind_manifest.json`
> plus the Max apply script in [`scripts/max/`](scripts/max/) automate that
> setup, including for models with thousands of IGUs.

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm test        # physics, MDL golden files, structural lint, packaging
pnpm typecheck   # whole app
pnpm lint
```

Regenerate golden MDL files after an intentional emitter change, then read the
diff before committing:

```bash
UPDATE_GOLDEN=1 pnpm test
```

## Layout

```
src/engine/      Pure TypeScript. No React, Next, three.js, or DOM.
  physics/       Slab and stack optics, substrate data, colour
  solve/         Cutsheet → material IR, per export mode
  mdl/emit/      Material IR → MDL text
  package/       README generation and ZIP packaging
  renderApi/     Contract for the future GPU render service
src/components/  Form, surface diagram, preview
src/lib/         Store, units, uploads, downloads
docs/            Physics assumptions, Iray compatibility log
```

The engine is a standalone library behind a hard boundary — enforced by lint
rules, a DOM-free tsconfig, and node-environment tests — so it can be extracted
or reused server-side without untangling it from the app.

Codegen goes through a semantic intermediate representation rather than string
templates. Solvers never emit strings and emitters never compute physics, which
is what lets new constructions (laminates, acid-etch, spandrel) arrive as a node
kind plus one emitter case.

## Accuracy

Generated materials reproduce visible-light appearance. They are not a
substitute for thermal or daylight analysis.

A cutsheet describes a whole assembly, so per-lite properties are inferred.
[`docs/physics.md`](docs/physics.md) documents the model and every
approximation in it; the app shows the fit residual, and it is repeated in each
export's README.

Output is validated against the MDL specification and by rendering in Iray, not
by a compiler in CI — see [`docs/mdl-compat.md`](docs/mdl-compat.md) for the
running record and the reserved compile-check job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).
