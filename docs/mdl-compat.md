# Iray / MDL compatibility log

Running record of what the generated MDL does inside a real Iray for 3ds Max
install. There is no MDL compiler in this repo, so this file is the only place
ground truth gets written down — every validation session should add an entry,
including the ones where nothing broke.

## Target

| | |
|---|---|
| MDL version | `1.6` (declared in `src/engine/mdl/target.ts`) |
| Modules used | `df`, `base`, `state`, `math`, `anno`, `tex` — core standard library only |
| Renderer | Iray for 3ds Max (Lightworks Iray+) 3.1, Iray 2025.0.3 SDK, 3ds Max 2022–2027 |
| Validated build | Iray+ `3.1.173473`, Iray `2025.0.3` build `387700.2665`, 3ds Max 2024 — every session below ran here |
| Loading | Custom MDL search paths, configured in the Iray+ settings |

No `::nvidia::` or vMaterials modules are referenced, so a generated file
resolves with nothing installed beyond the plugin.

Everything here is centralized: changing `MDL_VERSION` or the allowed module
list is a one-line edit, and the golden-file tests then show every output it
affects as a reviewable diff.

## Constructions in use

What the emitter currently produces, so a compatibility failure can be traced
to a specific decision.

**Planar (`thin_walled: true`)**
- `df::custom_curve_layer` over `df::specular_bsdf(mode: df::scatter_transmit)`
- `backface` carries a second stack with the interior reflectance
- The base tint is pre-divided by `1 - normal_reflectivity`, because
  `custom_curve_layer` mixes rather than adds and would otherwise darken
  transmission below the measured value

**Volumetric (`thin_walled: false`, `ior: color(1.52)`)**
- Uncoated lite: `df::specular_bsdf(mode: df::scatter_reflect_transmit)` alone,
  letting MDL do the real Fresnel split from the IOR
- Coated lite (emitter updated 2026-08-25): the **Material-ID assembly** the
  validation kit selected and the per-lite render validated. One material per
  lite; the coated lite declares a `uniform bool interior_face` and its
  surface ternary-selects the exterior vs cavity values of a fitted
  `custom_curve_layer` over a transmit-only `specular_bsdf` — assigned to face
  Material IDs 1 (exterior, off), 2 (cavity, on), 3 (edges, off), with body +
  coating absorption in the one shared `volume` (test 04 rule). Face values
  and volume come from `fitLiteFaces`, which inverts the renderer's own
  interreflection so the rendered lite reproduces the fitted aggregate
  exactly — including `custom_curve_layer`'s scalar transmission on coloured
  coatings. `validateForMode` now returns a setup *warning*, not a refusal.
  **A render of an emitter-produced coated export is still owed** — the
  hand-authored `g2m_v5227_dgu.mdl` validated the structure, not this exact
  output. Full detail and templates in [iray-findings.md](iray-findings.md).
- `volume.absorption_coefficient` in 1/metre

**Frit**
- Planar: `df::weighted_layer` folding frit into the single material
- Volumetric: a separate thin-walled decal material driven by
  `geometry.cutout_opacity`
- Frit BSDF: `df::normalized_mix` of `df::diffuse_reflection_bsdf` and
  `df::diffuse_transmission_bsdf`, split by opacity
- Patterns: module-level `export float` functions over
  `state::texture_coordinate(0)`, or `base::file_texture(...).mono`

## Validation-kit questions — answered 2026-08-23/24

The kit from `pnpm emit:validation-kit` was rendered per
[iray-validation-protocol.md](iray-validation-protocol.md). Consolidated
findings in [iray-findings.md](iray-findings.md); sessions below.

1. **Modules load** and materials appear in the browser. ✓
2. Are the `anno::display_name` / `anno::description` annotations shown?
   **Still unrecorded** — nobody looked; note it next session.
3. **`backface` works on thin-walled materials** (kit test 01: red front, blue
   back). Planar mode's interior reflectance stands on validated ground.
4. **`backface` is ignored on solids**, as the spec says (kit test 02: all red,
   no blue). Decision-tree rule 1 eliminated.
5. **Material IDs work on solids** (kit test 03: per-face surfaces, shared body
   still absorbing). Test 04: conflicting per-ID volumes resolve
   deterministically to the entry face's volume — so keep the volume identical
   on every ID and never depend on that behavior. Decision-tree **rule 2 is the
   production route**.
6. **The 0.13 mm decal offset renders cleanly** (kit test 05) — frit's shipping
   assumption holds.
7. Reflection-free solid plus Fresnel planes (kit tests 06/07): **moot, not
   run** — rule 2 won first.
8. **World-space physical sizing fails outright** — `state::position()` /
   `state::meters_per_scene_unit()` collapse to constants in the cutout context
   and render the surface invisible. Frit stays **UV-based**; coverage % is
   exact and scale-independent, absolute dot size needs a UVW Map modifier.
9. **No Iray log warnings observed** in any session to date.

## Sessions

### 2026-08-23 — kit test 01: `backface` on thin-walled materials

Build: glass2mdl (uncommitted working tree), Iray for 3ds Max (Iray+) 3.1,
3ds Max 2024. Rendered on the workstation a few days before this entry
(~2026-08-20); written up from Jeff's report.

Files: validation kit test 01 (thin-walled plane, red `surface` / blue
`backface`)

Result: loaded, rendered as expected
Findings:
- **Red front, blue back — the passing result.** `backface` genuinely renders
  a different surface on a thin-walled material in Iray, so planar mode's
  distinct interior reflectance stands on validated ground, not just the spec.
- No Iray log warnings observed.
Actions:
- Open question 3 above closed.
- Tests 02–08 still outstanding. Test 02 (is `backface` ignored on a solid?)
  remains the one that decides the volumetric coating structure.
  *(Superseded by the next session.)*

### 2026-08-23/24 — full kit, frit variants, and product validation

Build: glass2mdl (uncommitted working tree), Iray+ `3.1.173473`, Iray
`2025.0.3` build `387700.2665`, 3ds Max 2024. Run on the workstation; written
up 2026-08-24 from the workstation handoff doc, now saved as
[iray-findings.md](iray-findings.md). Evidence files (`results/…`,
`mdl/…`) live on the workstation and are not yet in this repo.

Files: validation kit tests 02–05 and 08, workstation-authored frit modules
`kit_10`–`kit_14`, and product materials for AGC V5227 DGU/TGU.

Result: loaded, no log warnings
Findings:
- **Test 02: `backface` ignored on solids** (all red) — spec confirmed,
  decision-tree rule 1 eliminated.
- **Test 03: Material IDs give a solid per-face surfaces** while the shared
  body keeps absorbing — **rule 2 is the production route**.
- **Test 04: conflicting per-ID volumes → the entry face's volume wins**,
  deterministically. Production rule: identical volume on every ID, always.
- **Test 05: decal at 0.13 mm offset is stable** — no z-fighting.
- **Test 08 (re-scoped): world-space sizing fails** — `state::position()`
  collapses to a constant in the cutout context, rendering the surface
  invisible. Frit is UV-based; coverage % is exact regardless of mapping.
- **Frit variants all render** (`kit_10`–`kit_14`): procedural dots, opacity
  map, integrated `weighted_layer`, decal, and one-sided normal-gated frit on
  a solid (`thin_walled` must be `false` or every face double-sides).
- **Planar product validation:** V5227 DGU measured VLT within −0.13% of the
  0.53 datasheet value, TGU within +0.004% of 0.48, against an 836.294 lux
  black-floor baseline. Transmission reciprocity confirmed.
- **Energy conservation:** measured `T = 1 − R` at normal incidence to
  −0.005% on a matte-black receiver; the pre-divided base tint is validated.
- **Coated solid via Material IDs (collapsed proxy): VLT 0.529 vs 0.53**
  (−0.2%). Reflectance asymmetry direction correct (exterior face brighter);
  absolute Rf/Rb magnitude unconfirmed — signal below render noise.
- **Max caches loaded MDL modules** — a file edit is silently ignored until
  the module gets a new filename or Max restarts.
Actions:
- Coated volumetric structure **decided: per-lite Material-ID assembly**
  (per-lite values from the inverse fit; the collapsed-assembly proxy was the
  validation vehicle, not the product).
- Emitter work queued: Material-ID coated-solid emitter, lift the
  `validateForMode` refusal, module-filename revision suffix (caching),
  emitter lint banning `state::position` / `state::meters_per_scene_unit`.
- Still open: absolute Rf/Rb via the near-normal mirror rig; a two-stacked-
  solids per-lite render against the 442.7 lux planar reference; annotation
  display (question 2); copying the evidence files into the repo.

### 2026-08-25 — per-lite g2m_v5227_dgu: accurate two-lite DGU (auto-applied + render-validated)

Build: glass2mdl_apply.py per-lite factory, Iray+ `3.1.173473`, Iray `2025.0.3`
build `387700.2665`, 3ds Max 2024.
Files: `mdl/templates/g2m_v5227_dgu.mdl` (deployed to `validation_kit/`);
`scripts/max/glass2mdl_apply.py` (`V5227_DGU_MANIFEST`, position-aware factory);
`scripts/max/fully_auto_build.py`. Evidence:
`results/evidence/transmission/2026-08-25_v5227-dgu-perlite-*` (workstation);
the API discovery output is in this repo at `scripts/max/discover_report.txt`
(scripts synced from the workstation 2026-08-25).

Result: loaded, rendered, measured — **VALIDATED on both transmission and
reflectance asymmetry.**
Findings:
- **Split the collapsed proxy into two real lites.** Outer = 6 mm low-iron +
  surface-2 low-e (`g2m_v5227_dgu_outer`, fitted T 0.5746 / Rf 0.1429 /
  Rb 0.0571); inner = clear low-iron (`g2m_v5227_dgu_inner`, `ior` Fresnel). The
  per-lite values were solved from the two-lite combination so the stack
  reproduces the datasheet by construction (T 0.530 / Rf 0.170 / Rb 0.130).
- **Auto-applied** via the discovery-proven irp factory (`Iray__Material` +
  `irpSetMaterialType` + `irpSetProperty`); outer/inner selected by the
  position-aware manifest. Material graph confirms per-face IDs + fitted values.
- **Transmission (black floor):** baseline 77.65 fc, glass 40.79 fc →
  **VLT 0.525 vs 0.53 (−0.89%)**. First validated per-lite stacked render (was an
  open check in the docs).
- **Reflectance asymmetry (gray floor):** exterior-down (flipped) 41.55 fc vs
  interior-down (normal) 41.38 fc; boosts over the black baseline 8.19 vs
  6.31 lux → **ratio 1.298 vs datasheet 1.308 (−0.76%)**. Direction and magnitude
  correct; boosts are <1 fc but consistent across all 91 grid points — better
  than the collapsed proxy, which sat at render noise.
Actions:
- Evidence + CSV rows saved (`product-v5227-dgu.csv`,
  `product-v5227-dgu-asymmetry.csv`).
- Per-lite **solid-lite-only** construction (low-e on the outer lite's surface 2
  via Material ID, inner clear) is the demonstrated production representation.
  Still open: absolute Rf/Rb via the near-normal mirror rig.

<!--
Template:

### YYYY-MM-DD — <what was tested>

Build: glass2mdl <version>, Iray for 3ds Max <version>, 3ds Max <year>
Files: <which fixture or export>

Result: loaded / failed
Findings:
- ...
Actions:
- ...
-->
