# Spandrel support — preliminary plan

**Status: planned, not built** (2026-09-01, end of the TGU field-test
session). Scope decisions below are Jeff's; pick this up from here.

## Context

With vision glazing field-validated on the GL31X facade, the next facade
element is spandrel — the model already carries Spandrel-Nose/Podium/Tower
layers. Per Jeff: v1 covers BOTH spandrel constructions (back-painted /
opacified glass AND shadow-box: glass + air cavity + opaque metal back
pan), build-ups vary (monolithic and IGU both), and the available
data-sheet inputs are unknown for now — design all input paths, calibrate
the card copy once Jeff pulls a real spandrel data sheet.

Engine readiness (explored): `LayerIR` already has the `diffuse` kind —
"spandrel/back-painted; reserved for P5" (`src/engine/types/ir.ts:47`) —
and BOTH emitter cases exist in `src/engine/mdl/emit/layers.ts`
(`baseBsdf` → `df::diffuse_reflection_bsdf`, `wrap` → weighted_layer).
The work is everything around it.

## Input model (`src/engine/types/system.ts` + `src/engine/index.ts` re-export)

```ts
spandrel?:
  | { kind: "back-paint"; surface: SurfaceNumber; color: ColorSpec }
  | { kind: "shadow-box"; cavityMm: number;
      pan: { color: ColorSpec; finish?: "matte" | "metallic" } }
```
Top-level optional, like `frit`/`rollerWave`. Back-paint surface is
typically the last surface (`maxSurface(lites.length)`); validate range,
warn on non-final placement. Shadow-box's pan is a terminal element after
the last lite — no change to `lites`/`gaps` shape.

## Physics / solver

- **Seeding**: `naturalAssemblyOptics` / `seededAssembly`
  (`src/lib/store.ts:44`) get a spandrel branch — `tvis: 0`, `rvisExt` =
  glass first-surface + double-pass-attenuated paint/pan reflectance
  (reuse `slabOptics` / interface math in `physics/slab.ts`). Without this,
  any lite edit re-seeds VLT to ~0.88.
- **Fit** (`physics/assembly.ts`): no coordinate descent. When Rvis-ext is
  entered, solve the paint/pan reflectance so the composed exterior
  matches (level from the %, hue from the color spec — the tool's
  standing rule). When only a color is given, render it at face value.
  Unreachable targets (below bare Fresnel ~4.3%) report through the
  existing `fitResidual` → verdict channel.
- Interior face default: dark neutral diffuse (slab/insulation behind);
  revisit if Jeff's sheets say otherwise.

## IR / emitters (`src/engine/solve/volumetric.ts`, `planar.ts`)

- **Back-paint, volumetric**: the painted lite keeps the existing
  Material-ID structure; its interior-face layer stack becomes `diffuse`
  (paint) — the `interior_face` ternary already selects per-face, and the
  `diffuse` emitter case exists. Exterior face + shared volume unchanged.
- **Back-paint, planar**: thin-walled `[fresnel-coating (glass), diffuse]`,
  `backface` diffuse, zero transmission.
- **Shadow-box, volumetric**: glass lite(s) = normal (un)coated lite
  materials; the pan is a SEPARATE opaque material (diffuse; same on all
  IDs) — depth comes from real geometry.
- **Shadow-box, planar**: glass plane material + pan plane material, two
  planes in the scene; README documents the offset.
- Frit on a spandrel: out of v1 (full-coverage opacifier is the frit).

## Manifest / README (`src/engine/package/manifest.ts`, `readme.ts`)

- Painted lite rides the existing positional `by_position` entries.
- Shadow-box pan ships as its own manifest TYPE entry (not a `by_position`
  slot) so the Max GUI's existing multi-type flow (type combo + "Mark
  selection as this type") assigns it — no new GUI mechanism.
- README: which pane, paint on which surface, pan assignment note.
- Gotcha: `typeName` embeds the param signature — param changes rename the
  MDL type (revision suffix already handles Max caching).

## UI (touch list from exploration)

- `src/lib/store.ts`: `spandrel` field + set/update/remove actions,
  `setLiteCount` pruning, `seededAssembly` branch, `defaultSpandrel()`
  (mirror `defaultFrit`, store.ts:221).
- `SurfaceDiagram.tsx`: extend `DiagramFeature` union; third feature
  prop on `SurfaceDiagram`/`MiniSection`; `SurfaceMarker` flags +
  `occupied`; `featureTagY` 3-slot stacking; shadow-box renders the pan
  as an opaque terminal bar after the last cavity (new element, not a
  surface tag).
- `DiagramPanel.tsx`: `canAddSpandrel`, `handleAddAt` "exactly one kind
  remaining" logic, chooser button, `jumpToFeature` anchor, `CondensedBar`
  pill.
- `FeatureCards.tsx`: `SpandrelCard` on `FeatureCardShell` — kind toggle
  (Back paint / Shadow box), surface select OR cavity+pan fields, color
  via the `ColorSpec` editor (generalize `ColorEditor`/`TypedInputs` off
  `ColorKey` so Lab/xy datasheet entry works for paint); ghost-card
  n-of-3 logic in `SurfaceFeaturesGhost`.
- `AssemblySection.tsx`: VLT `PercentInput` disabled (prop exists) + tvis
  forced 0 + copy; energy bar becomes reflected + absorbed. `NumberStrip`
  in DiagramPanel hardcodes the three spans — adjust.
- `fitVerdict.ts` + `ResultSection.tsx` `FitTable`: parameterize
  `FIT_QUANTITIES` and pass the reflectance-only subset for spandrels.
- Tag color: use the remaining `--danger`/`--success` soft pair tokens.

## Max apply script (`scripts/max/glass2mdl_apply.py`)

- Detection/tagging needs nothing: spandrel geometry is lite-shaped and
  "spandrel" is already in GLAZING_NAME_HINTS; monolithic panels get
  position "monolithic"; welded panels go through sheet pairing as now.
- **REQUIRED FIX — two-product clobbering**: `do_bind`'s single-type
  branch re-stamps EVERYTHING tagged to the manifest's type, so assigning
  a spandrel ZIP after the vision ZIP clobbers the vision lites. Fix:
  when a viewport selection exists, single-type Assign stamps/binds only
  the selection; empty selection keeps apply-to-all with its messaging.
- Shadow-box pans: expected to pass the lite test as thin sheets and bind
  through the multi-type Mark-selection flow; if real pans are modeled
  otherwise, `debug_shells` tells us and we adapt (decision point during
  implementation, with field geometry in hand).

## Tests

- Fixtures in `tests/mdl/fixtures.ts`: back-paint monolithic, back-paint
  IGU, shadow-box — planar + volumetric; goldens via
  `UPDATE_GOLDEN=1 pnpm test` (review diffs).
- `semantics.test.ts`: `evaluateAtNormalIncidence` needs a `diffuse`
  branch (it currently zeros unknown innermost layers); assert
  transmission exactly 0 and exterior reflection = glass over paint.
- `export.test.ts`: manifest shape (pan as sibling type), README naming.
- Physics round-trip: entered Rvis-ext reproduced by the composed stack.

## Rollout order (one deliverable, staged internally)

1. Back-paint end-to-end (engine → UI → export) — smallest full slice.
2. Max two-product assign fix + field test on the real model (vision +
   spandrel ZIPs coexisting).
3. Shadow-box (pan element, second manifest type, pan assignment flow).
4. Calibrate the data-sheet card copy against a real spandrel sheet from
   Jeff; adjust inputs if sheets carry values we didn't anticipate.

## Verification

`pnpm test` green at each stage (goldens reviewed, not rubber-stamped);
synthetic Max scene with a spandrel box + pan; then Jeff's model: vision
lites already bound → select spandrels → Assign spandrel ZIP → confirm no
clobbering, QA, Iray render (opaque with glass reflection; shadow-box
reads with depth).
