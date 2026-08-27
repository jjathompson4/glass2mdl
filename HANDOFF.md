# glass2mdl — status, open questions, and things we argued about

Written at the end of the first two working sessions. Read this before picking
the project back up.

**Where it stands:** the tool works end to end. Enter cutsheet data, get a ZIP of
MDL materials with a README. 240 tests, lint, both typechecks, and the build are
green. As of 2026-08-23/24 the generated MDL has been **rendered and measured in
the real target Iray build** (Iray+ 3.1.173473, 3ds Max 2024) — planar products
validated to within 0.2% of datasheet values. The old "never rendered" caveat is
retired; what remains unvalidated is called out per item below.

**Update 2026-08-25 (workstation).** Two more things are now proven and change
the work queue below:
- **Iray+ MDL materials are fully scriptable** — a script creates the material
  and points it at a custom `.mdl` module, so the Max apply workflow's *automatic*
  Bind mode is confirmed (no drag-per-type fallback needed). Recipe + evidence in
  [`docs/iray-findings.md`](docs/iray-findings.md) §10 and
  [`docs/max-apply-workflow.md`](docs/max-apply-workflow.md).
- **The per-lite coated-solid structure is render-validated on both axes.** A
  hand-authored two-lite AGC V5227 DGU (`mdl/templates/g2m_v5227_dgu.mdl` in the
  byo_mdl validation repo — outer low-iron + surface-2 low-e / inner clear)
  reproduced datasheet VLT (0.525 vs 0.53, −0.9%) *and* the reflectance asymmetry
  (gray-floor boost ratio 1.30 vs 1.31, −0.8%). This is the emitter's target.

---

## The former blocker — resolved 2026-08-23/24

**Coated volumetric export has its structure: a per-lite Material-ID assembly.**

The validation kit was rendered on the workstation and the decision tree landed
on rule 2. Test 02 confirmed `backface` really is ignored on solids (rule 1
eliminated); test 03 confirmed Material IDs give a solid per-face surfaces
while the shared body keeps absorbing; test 04 characterized the one hazard —
conflicting per-ID volumes resolve to the entry face's volume — which the
production rule sidesteps: **vary only the surface per ID, keep the volume
identical on every ID.**

The structure per coated lite: each face's Material ID carries a coating that
*replaces* the interface (transmit-only specular base under a fitted
`custom_curve_layer` — the "layers only add, low-e subtracts" argument that
forced this is preserved in [`docs/physics.md`](docs/physics.md) and
[`docs/iray-findings.md`](docs/iray-findings.md)), with body absorption in the
shared `volume`. **Decided 2026-08-24: volumetric mode emits one material per
lite** with per-lite values from the inverse fit, matching real modeled IGU
geometry — the collapsed single-solid used for validation was the test vehicle,
not the product.

Validated so far: assembly transmittance through the Material-ID structure
(VLT 0.529 vs 0.53 datasheet, −0.2%), and — **new 2026-08-25** — the full
**per-lite** stacked render: two distinct solid lites (outer coated, inner clear)
reproduce datasheet VLT (0.525, −0.9%) *and* the reflectance asymmetry direction
+ magnitude (gray-floor boost ratio 1.30 vs 1.31, −0.8%). The two-stacked-solids
open item is now **closed**. Still open on the workstation: **absolute** Rf/Rb via
the near-normal mirror rig (the gray-floor method gives the ratio, not the
magnitude). Test 08 re-scoped frit: world-space sizing fails outright in this
build (`state::position()` collapses to a constant and the surface disappears),
so frit stays UV-based and coverage % is the spec.

### The work queue this unlocks

1. **Material-ID coated-solid emitter — DONE 2026-08-25 (laptop).** The
   volumetric emitter now produces the validated per-lite structure: the
   coated lite is one material with an `interior_face` bool whose surface
   ternary-selects the exterior vs cavity `custom_curve_layer` values over a
   transmit-only base, body + coating absorption in the shared `volume`;
   uncoated lites keep real `ior` Fresnel (now with an exposed `ior` float so
   no emitted signature is a never-validated bare `()`). The
   `validateForMode` refusal became a setup *warning*; goldens regenerated;
   semantics tests extended. **The fit goes one step past the workstation
   shortcut:** `fitLiteFaces` (physics/slab.ts) inverts the renderer's own
   interreflection — face reflectivities and volume sized so the *rendered
   composition* of the two fitted faces reproduces each lite's aggregate
   exactly, including custom_curve_layer's scalar-tau behavior on coloured
   coatings (the shortcut's ~1% gaps). `tests/mdl/semantics.test.ts` pins the
   round trip. Not yet rendered — see item 7.
2. **Max apply workflow — VALIDATED 2026-08-25, automatic Bind confirmed.**
   `scripts/max/glass2mdl_apply.py` runs end to end (tag faces → QA → bind
   per-type Multi-Subs; scales with glazing types, not IGU count) and now creates
   Iray+ MDL materials **by script**: `rt.Iray__Material()` →
   `rt.irpSetMaterialType(mat, "mdl::<pkg>::<module>::<material>(<sig>)", emit)` →
   `rt.irpSetProperty(mat, key, val)` guarded against `irpGetPropertyList` (irp
   param key = `<type>_<param>`). `discover_iray_mdl_api.py` PASSED. glass2mdl
   should **ship a manifest** in the export ZIP so the apply script binds
   automatically — `{prefix: {by_position: {outer/inner: {type_name, params,
   slot_params}}}}` (see `V5227_DGU_MANIFEST` in `glass2mdl_apply.py` for the exact
   shape; `fully_auto_build.py` is a one-shot). Idioms match the in-house
   Iray-Mapper (GitHub copy is stale; the workstation has the current version).
   **The manifest now ships (2026-08-25):** volumetric exports include
   `bind_manifest.json` (format `glass2mdl-bind-manifest` v1, built by
   `src/engine/package/manifest.ts`), and the apply script gained
   `load_manifest()` to consume it.
   **Requirement (Jeff, 2026-08-25): the 95% case is architect-delivered,
   already-modeled per-lite geometry** — the shipped script must let users
   select IGUs for conversion or identify them automatically. Added on the
   laptop 2026-08-25 (needs workstation re-validation; laptop copy is now
   ahead of byo_mdl): `find_glazing()` scene-wide geometric scan (lite test +
   in-plane width test that rejects mullion profiles; selects candidates for
   viewport review) and `assign_type()` selection-based typing; `bind()`
   resolves the type stamp first, then the name/layer pattern map — both
   typing options are supported.
3. **Module filename revision suffix — DONE 2026-08-25.** Every emitted .mdl
   filename ends in a content hash (`_r7f3a9c`, FNV-1a over source + texture
   bytes, `contentRevision` in mdl/naming.ts), so a changed re-export never
   collides with a module Max has cached, while an identical re-export keeps
   its name. The ZIP folder stays stable; the bind manifest's type names carry
   folder::module correctly. Goldens untouched (the name is not in the
   source).
4. **Emitter lint — DONE 2026-08-25.** Structural tests ban `state::position`
   / `state::meters_per_scene_unit` in all emitted source.
5. **Frit alignment — DONE 2026-08-25.** `patternCoverage` already saturated
   at 1 and the overlap warnings already fire exactly at the π/4 threshold
   (diameter > spacing is the same condition); tests now pin both. The
   normal-gate fragility note lives in iray-findings §9.4.
6. **Generated README additions — DONE 2026-08-25** with the emitter work:
   Material-ID setup per coated lite, imperial system-unit caveat,
   module-caching warning, bind-manifest pointer.
7. **Second coating (pinned)** — allow a second coating when the user enters
   its published transmit/reflect values, pinning it so the first coating's
   three unknowns still close against the three measurements. Unlocks
   per-lite volumetric fidelity for products like the V5227 TGU (#2 + #4);
   planar mode already reproduces such assemblies exactly.
8. **Roller wave (2026-08-27, v3: Max-side bump map — awaiting one
   workstation render)** — after TWO field failures proving
   `material_geometry.normal` in MDL is silently ignored by Iray+ 3.1
   (iray-findings §7.6), the ripple left the MDL entirely. Jeff's discovery
   unblocked it: the Iray+ MDL material node in Max exposes Max-side map
   channels (geometry opacity/normal/displacement), and a hand-wired Noise
   map on geometry normal visibly distorts rendered reflections. Design now:
   exports ship `roller_wave_bump.png` (512px grayscale height map, bright =
   high, full-range normalized, deterministic, ~40KB;
   `src/engine/mdl/emit/rollerWave.ts` + `package/png.ts`), the bind manifest
   carries a top-level `roller_wave` entry ({file, depth, depth_mm, tile_m}),
   and the apply script's Assign wires the map into every lite material's
   geometry normal channel as a shared "g2m roller wave" bitmap — visible
   and tweakable in Slate, which is the workflow Jeff wanted all along
   (`_roller_wave_bitmap` + `_wire_roller_wave`; property names are probed,
   depth presets scale a channel amount or the bitmap's Output Amount:
   subtle 0.4 / typical 1.0 / strong 1.9 — PLACEHOLDER VALUES, calibrate
   against Jeff's first render and bake his number in). The MDL is now
   optics-only (export test enforces it); planar mode has no script, so the
   README tells those users to wire the map by hand. UVW Map + name-seeded
   per-object offsets still provide the lite-to-lite variability. Kit entry
   renamed 09_object_variation (state::object_id probe; arity bug fixed).
   GATE: one workstation render of a real export (fresh ZIP → Assign →
   grazing reflection) before deploy, plus the strength calibration.

9. **Workstation follow-ups** — the Iray+ API discovery and the apply-workflow
   validation are **done** (2026-08-25); the per-lite stacked render is **done**.
   **END-TO-END PIPELINE VALIDATED on a real scene (2026-08-26)**: Jeff took a
   V5227 export from the tool through the apply GUI — 25 candidates found
   (mixed classes, 3 auto-collapsed), 18 lites tagged into 9 IGUs, QA colors
   correct, bound via the manifest, and the glass renders correctly in Iray.
   The field test surfaced and fixed: Max's shared script namespace shadows
   the `max` builtin with a module (builtins aliased now); an unresolved
   MDL module binds pink (now refused with a placement message + probe on
   manifest load); and three GUI rounds (window on run, selection-first,
   type controls hidden for single-type manifests).
   **VLT measurement confirmed accurate on the workstation (Jeff, 2026-08-26)**
   — the quantitative loop is closed. The apply script now **ships inside
   every volumetric export ZIP** (embedded via `pnpm embed:max` into
   `applyScript.generated.ts`; a test fails on drift), so the ZIP is the
   complete workflow. Remaining: mirror rig for **absolute** Rf/Rb; check
   whether `anno::` annotations display; push the current Iray-Mapper to
   GitHub. Evidence lives in the byo_mdl repo under
   `results/evidence/transmission/2026-08-25_*`.

---

## Decisions still owed

| Question | Notes |
|---|---|
| **Final name** | `glass2mdl` vs `glazing2mdl`. Lives in one constant (`TOOL_NAME` in `src/engine/mdl/target.ts`); rename is one line plus golden regeneration. Also decides the domain. |
| **Volumetric coating structure** | **Decided 2026-08-24, implemented 2026-08-25:** per-lite Material-ID assembly — emitter shipped, refusal lifted, manifest in the ZIP. Iray render of a real export still owed (work-queue item 7). |
| **Preview scope** | Deferred by decision. An approximation was built and deleted — see below. Leading idea: a viewing-conditions panel (clear day / overcast / dusk / **night with interior lights**), exterior/interior, orbit for glancing angles, light-balance slider. Whatever is chosen, the render API's `RenderScene` enum should be updated to match so both previews speak the same vocabulary. |
| **GPU render infra** | API-first was agreed; infra never chosen. Options were serverless cloud GPU (Modal/RunPod, cents per render) vs. your own NVIDIA hardware behind a tunnel. Contract is already written in `src/engine/renderApi/contract.ts`. |
| **Observer handling** | 2° vs 10° is captured as metadata only; conversion uses the 2°-based sRGB matrices. Fine for now — the error is below our other approximations — but revisit if colour accuracy ever gets tightened. |
| **Git / hosting** | **Committed and pushed 2026-08-25** to the private repo github.com/jjathompson4/glass2mdl (repo name doesn't lock the product name; GitHub renames redirect). CI workflow runs on push; the `mdl-compile-check` job stays reserved (`if: false`) until the render service lands. |
| **Vercel deploy** | Never deployed. |

---

## Things we worked out that aren't obvious from the code

Recorded because they were expensive to discover and easy to accidentally undo.

**MDL's layering functions mix, they don't add.** `custom_curve_layer` gives
`w·layer + (1−w)·base`. Two consequences: a transmission tint underneath must be
pre-divided by `(1−w)` or every planar material comes out too dark; and nothing
layered on glass can reflect less than the glass. Both are load-bearing.
`tests/mdl/semantics.test.ts` re-implements this evaluation to stop it
regressing — it is the closest thing we have to a compiler.

**Planar mode gets `backface`; volumetric can't.** A thin-walled material can
give its interior side a different reflectance, which is why planar reproduces
exterior *and* interior reflectance exactly. Both halves are now
render-confirmed (kit tests 01 and 02). A solid's equivalent is Material IDs —
per-face surfaces over a shared volume — which is what the coated-solid
structure builds on.

**Coated lites use a transmit-only base.** The coating owns reflection outright,
because layering could never reach a sub-Fresnel low-e value. Refraction
survives: a transmit-only specular BSDF still bends light by the material IOR.
Uncoated lites keep MDL's real Fresnel split from the IOR, which beats any curve
we could fit.

**Hue and level are separate, everywhere.** Level always comes from the measured
percentage; hue comes from measured colour when given and the nominal tint table
otherwise. This rule is why one photopic number can drive a coloured result, and
why `L*` gets cross-checked against VLT (L*≈87 ↔ 70% Tvis — the same claim
stated twice).

**The residual is a feature, not a warning to suppress.** Decomposing one set of
assembly numbers into per-lite properties is underdetermined. The coating
carries three free parameters; with no coating there is one, and transmittance
wins. Unreachable targets return the closest achievable answer plus a residual
rather than failing. Entering 8% interior reflectance on a double IGU honestly
reports ±2.1 points because bare inner glass cannot go below ~10%.

**Energy conservation caps pinned overrides.** Pinning a coating to 30%
reflectance limits its transmittance to 70%, so the assembly lands lower than
the target. Correct, and surfaced as residual — not a bug.

### Reference numbers worth keeping

| | |
|---|---|
| Bare glass Fresnel (n=1.52) | 4.26% per interface |
| 6mm clear float | Tvis 88%, Rvis 8%, body t 0.958, σ ≈ 7.2/m |
| Uncoated 6+6 clear IGU | ~78% VLT, ~14% exterior reflectance |
| Solarban 60 (2) Clear+Clear | 70 / 11 / 12 (Vitro datasheet) |
| L* ↔ Y | L*≈87 = 70% · L* 20–97 spans real products · a*/b* usually ±20 |

---

## UI redesign (2026-08-25) — guided five-step flow

Jeff reviewed the original layout as unintuitive ("no one is going to know how
to use this on first visit") and the whole page was redesigned on a design
canvas (claude.ai/code/artifact/2fc3bf3b-0c66-4492-962a-0f4c01e39ace), then
implemented. The shape now follows the user's workflow, not the engine's:

1. **What are you making?** — planar/volumetric as a plain question about the
   Max scene, plus the product name.
2. **Construction** — build-up, diagram (every feature *labeled* in place:
   "coating", "frit"), and the coating's *placement* only.
3. **Cutsheet numbers** — the three percentages; absorption displayed, never
   entered, with a line saying why.
4. **Fine-tuning (optional)** — disclosures: Glass colour (swatch-first: shows
   the derived colours, "Adjust…" per swatch, jargon in helper text, observer
   toggle inside), Coating overrides (read-only fitted values + "Override…" —
   the "Pin" control is gone for good, per Jeff), Frit.
5. **Check & download** — fit-check verdict first (exact/within-x/off-by-x
   with the worst quantity named), entered-vs-produced table, per-pane details
   in plain words (no bare σ), files + download. The "Appearance / Coming
   soon" panel became one muted line here.

Jeff's copy standards from this review are in auto-memory
(`ui-copy-standards`): no "Pin", "Adjust" not "Correct", no unexplained
jargon or symbols, show-don't-configure, workflow-order forms, **"lites"
never "panes", American spelling** (meter/color). Deleted: DerivedPanel,
ExportSection, ColorField (replaced by ResultSection, TargetSection,
GlassColorPanel, FineTuningSection); PreviewPanel is unused pending the
render service.

Round 2 (same day, after Jeff's follow-up review):
- **Construction-aware defaults**: `naturalAssemblyOptics` (physics/assembly)
  seeds the three performance numbers to what the nominal uncoated build-up
  produces, re-seeding on construction changes until the user first edits a
  number (`assemblyEdited` in the store) — the tool never lands in a state
  its own fit check calls wrong. Sliders cap at T + R ≤ 100%; typed values
  are never rewritten, only flagged.
- **Units toggle removed** — everything is mm; Iray/Max glazing thinks in mm
  and cutsheets print it. The plumbing (`lib/units.ts`) remains if it ever
  returns.
- **Frit**: real drag-and-drop upload zone for custom maps (no surprise file
  dialog), and tappable surface chips (#1–#N) — previously the frit surface
  was displayed but not choosable at all.
- **One-coating limit explained in place** (three measurements ↔ one
  coating's unknowns; multi-coated products still export correctly since the
  numbers describe the finished assembly). True second-coating support —
  user-supplied published values pinning coating #2 so the fit stays solvable
  — is queued below as item 8.

Round 3 (2026-08-25, commit `4086e4e`) — **diagram-first layout**, replacing
the numbered five-step flow after Jeff asked to streamline further ("the
coating card is different than the frit section, and the sliders are weird").
Three directions were mocked on the canvas; Jeff picked Diagram-first with
consistent card widths and the diagram staying visible while cards scroll:

- **Pinned panel** (`DiagramPanel`): the to-scale cross-section, the three
  cutsheet numbers, and the fit verdict stay on screen; scrolled past ~180px
  it condenses to a one-line bar (mini section, name + build-up summary,
  feature chips, numbers, verdict). Hysteresis (expand only near the top)
  prevents condense/expand oscillation from the page-height change, and card
  jumps land instantly then re-measure once the condensed layout settles.
- **The diagram is the interface**: feature tags ("coating", "frit") are
  pills that jump to their cards; bare surfaces show a dashed + that adds a
  feature there (a chooser row appears only when both kinds are still
  possible). Display-only rendering stays available by omitting the handlers.
- **Identical feature cards** (`FeatureCards`): Coating and Frit share one
  anatomy — colored square matching the diagram tag, type/pattern beside a
  surface dropdown, Remove — and collapse to dashed "Add a coating"/"Add
  frit" rows when absent. Coating's fitted values (Transmits/Reflects out/
  Reflects in) sit in its card with Override… opening the overrides panel
  inline.
- **Glass color lives in Construction** as a swatch row (three swatches +
  Adjust… opening the round-1 panel inline). **Sliders are gone** from
  Cutsheet values — typed numbers with the energy bar as the visual check.
- **One verdict, two places** (`fitVerdict.ts`): the panel chip and the
  Download card's fit-check disclosure share the computation, so they can
  never disagree. Steps are no longer numbered; TargetSection and
  FineTuningSection were deleted (name + mode toggle moved to a header row).

## UI review findings (session 2)

Both rounds of feedback caught things that "passed" automated verification.
Worth remembering that asserting an element *exists* is not verification.

- **Colour controls overflowed their columns** and overlapped, with "Swatch"
  clipped mid-word. Pairing colour with each performance value was right;
  putting it inside the same column was not. Now full-width rows.
- **Swatches read as unchecked checkboxes**, and reflectance chips drawn at
  their true level were black squares that looked like missing data. Now round,
  showing hue at full brightness, with the percentage carrying level.
- **The construction diagram scaled to fill width**, so a 6mm lite rendered
  ~10× wider alone than in a triple — it implied the glass changed thickness.
  Now a fixed px/mm scale against a 52mm reference span, centred, with gaps at
  true proportion (a 12mm cavity really is twice a 6mm lite). Verified 42.5px
  per 6mm lite in all three configurations.
- **There was no theme toggle at all** — only a `prefers-color-scheme` query.
  Now Light/Dark/System in the header, persisted, applied before first paint.

---

## Known approximations (all documented in `docs/physics.md`)

- **Tint table is nominal.** A single VLT cannot determine a spectrum, so an
  un-measured hue is a guess. Entering Lab/x,y/swatch data removes the guess for
  that quantity. `src/engine/physics/constants.ts` is the one file to tune
  against real renders. IGDB import is the eventual real fix.
- **Schlick exponent 5** is assumed for angular falloff; cutsheets only report
  normal incidence, so the angular shape is invented.
- **One coating at a time.** A second adds unknowns with no measurement to fit
  them against.
- **Frit sits outside the fit.** Cutsheet values describe the vision area, so
  glazing is fitted to those and frit layers over the result.
- **Normal incidence throughout.**
- **Uploaded frit masks** report coverage as 1.0 inside the engine; the real
  coverage is measured in the browser at upload time and shown in the UI.

---

## Not built (architecture accommodates, roadmap order)

1. **GPU render service** — contract written, routes return typed 501. Enabling
   this also enables the reserved `mdl-compile-check` CI job (currently
   `if: false` in `.github/workflows/ci.yml`), which would compile the golden
   files with NVIDIA's open-source MDL SDK and finally give us a compiler.
2. **Preset product library** — presets are just serialized `GlazingSystemInput`
   JSON plus provenance; the input type is deliberately serializable for this.
3. **LBNL IGDB spectral import** — a front-end to the solver producing the same
   per-lite RGB the solvers already consume. IR and emitter untouched.
4. **Laminated lites (PVB), acid-etch/satin, spandrel/back-painted** — each is a
   new `LayerIR` kind plus one emitter case. The IR is the extension seam.
5. **Side-by-side compare** of two configurations under identical conditions.

The rule that keeps these cheap: **solvers never emit strings, emitters never
compute physics, everything crosses via the IR.**

---

## Orientation for a fresh session

```bash
pnpm dev                    # the tool
pnpm test                   # physics, golden MDL, structural lint, packaging
UPDATE_GOLDEN=1 pnpm test   # after an intentional emitter change — read the diff
pnpm emit:validation-kit    # the Iray kit
```

- `src/engine/` is pure TS behind a hard boundary (lint rules, DOM-free
  tsconfig, node-env tests). No React, Next, three.js, or DOM.
- `src/engine/physics/assembly.ts` holds the inverse fit — the heart of it.
- `src/engine/mdl/target.ts` is the single place MDL version and allowed modules
  are decided.
- `docs/physics.md` — the model and every approximation in it.
- `docs/mdl-compat.md` — Iray compatibility log. The full kit plus product
  validations are recorded (sessions of 2026-08-23/24); the ground truth lives
  here and in `docs/iray-findings.md`.
- `docs/iray-findings.md` — consolidated workstation findings and proven MDL
  templates. Its `results/…` / `mdl/…` evidence paths refer to the
  workstation, not this repo.
- `docs/iray-validation-protocol.md` — the validation protocol (executed;
  kept for reruns on new Iray builds).

Related: you own **pbr2rad.com**, and this is its sibling. Nothing is shared
between them today; worth deciding at some point whether they should share
conventions, hosting, or branding.
