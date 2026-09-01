# Spandrel support

**Status (2026-09-01): engine slice built (flood coat + back pan, both
pipelines); UI, Max pan tagging, and the two kit renders still to do.** Scope
is Jeff's, revised in the 2026-09-01 interview; the earlier draft assumed a
spandrel had its own data sheet to solve against. It does not.

## What a spandrel is, for this tool

A normal glazing build-up chosen from a glazing data sheet (coated or not),
plus an opaque finish the manufacturer offers behind it:

- **flood coat** — opaque paint fused to the back of a lite, typically #4 on
  a double unit (what Jeff's architects usually do), or
- **back pan** — a metal pan behind an air cavity (shadow box), matte or
  metallic.

There is no spandrel data sheet. The glass is fitted exactly as vision glass
(VLT stays enabled; it is the glass's VLT), and the finish colour is taken
as given — the one place a colour sets level as well as hue. The tool's job
is the export plus a forward "reads as, from outside" colour: the finish seen
through the fitted glass, which is what the Iray render is judged against.
See `docs/physics.md` → Spandrel.

Decisions: both finishes in v1, matte and metallic pans, both pipelines, own
product and own ZIP (a spandrel is the vision build-up plus a finish and a
new name — the store holds one system, so "start from vision" is just that),
flood coat fully opaque (the pan behind it never renders), colour by RAL
number / manufacturer chart eyedrop / sample photo. Frit and spandrel are
mutually exclusive.

## Built (engine, `src/engine`)

- Input: `spandrel?: SpandrelInput` on `GlazingSystemInput` (`types/system.ts`).
- Forward appearance: `spandrelAppearance` in `physics/assembly.ts` →
  `DerivedOptics.spandrel { readsAs, glassOnly, finish }`.
  `resolveColorSpecAbsolute` (colorimetry) keeps a colour's level.
- IR: `diffuse` gains `interiorFaceOnly`; new `metal` kind. The emitter
  lowers an interior-only diffuse to a **bsdf conditional** on the existing
  `interior_face` bool (`interior_face ? diffuse : glass`) — new structure,
  gated by validation-kit test 12; metal → `simple_glossy_bsdf`, kit test 13.
- Volumetric: the painted lite keeps its glass shape and gains the
  conditional paint on ID 2 (+ `interior_face` param if it had none, so the
  manifest's `slot_params` drive it); lites behind the paint export as plain
  glass. A back pan is its own material `${prefix}_pan`, shipped in the
  manifest as a second type with `by_position._default` and
  `roller_wave: false`.
- Planar: flood coat = one opaque thin-walled surface (glass reflection layer
  over a diffuse base compensated so the two compose to `readsAs`; dark
  backface). Back pan = the ordinary planar glass plus a `_pan` plane
  material; README places it at the cavity depth.
- Validation: surface must be a back face, range, frit exclusion, coating
  hidden under the paint (warning), cavity required / unusual, Material-ID
  note for volumetric flood coats.
- README/provenance name the finish and the reads-as colour. Tests: fixtures
  + goldens for 7 spandrel exports, semantics, physics, export, validation.

## To do

1. **UI** (`src/components/GlazingForm/`): store `spandrel` + actions and
   `setLiteCount` pruning; a third feature card "Spandrel finish" (kind
   toggle, back-face surface select or cavity + finish, colour by RAL number
   → hex table, hex/eyedrop, label); diagram tag for the flood coat and an
   opaque terminal bar for the pan; condensed-bar pill; colour panel shows
   "Spandrel, seen from outside" (`readsAs`) and marks looking-through as
   opaque; ghost card n-of-3.
2. **Max apply script**: pans that fail the lite test cannot be tagged today
   → a "Tag selection as pan" path (stamps tagged/type/position without face
   IDs). Honour the manifest's `roller_wave: false`. A pan modelled as a thin
   solid sheet passes `_pair_sheets` as a lite and would turn a DGU spandrel
   into outer/center/inner — decide a minimum sheet thickness screen after
   the workstation check (W1 below). `bind()` already leaves foreign products
   and unknown positions alone (2026-09-01 fix).
3. **Kit renders 12 and 13** on the workstation before any spandrel ZIP goes
   to a project (render gate). Then the field model: vision lites bound,
   select spandrels, Assign the spandrel ZIP, confirm no clobbering, render.
4. RAL classic → sRGB table (small, public); Pantone stays eyedrop-by-eye.

## Open loops (away from the desk)

Workstation: **W1** Debug shells on one spandrel panel (lites found: 2 or 3;
the pan shell's verdict and thickness; does the inner lite exist as glass).
**W2** cavity depth glass→pan (grouping threshold is 150mm). **W3** on
planar-modelled facades, is there a pan surface to assign to? **W4** the TGU
split's Iray render is still owed; confirm before the two-ZIP field check.
**W5** kit renders 12 and 13.

Teammates / manufacturers: **T1** how pan finishes are specified when they
reach you (Kynar names, RAL, anodized) and how often pans are metallic.
**T2** flood coat type (ceramic frit vs silicone opacifier): confirm nobody
needs translucency. **T3** Pantone-by-eye acceptable? **T4** do spandrel and
vision share the coating on typical projects (affects only copy).
