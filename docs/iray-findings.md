# Glazing MDL Generation — Tested Findings & Implications

> **Provenance (repo note, 2026-08-24):** written on the render workstation
> after the 2026-08-23/24 Iray validation sessions and copied into this repo.
> Every `results/…` and `mdl/…` path below refers to the **workstation's**
> filesystem, not this repo — the evidence files have not been copied over yet.
> Decisions made after this doc was written: volumetric mode emits **one
> material per lite** (not the collapsed single-solid used for the §9.6
> validation); module filenames will carry a revision suffix (§7.2 caching);
> `state::position()` will be banned by emitter lint (§7.1). See
> [mdl-compat.md](mdl-compat.md) for the running log.

The single reference for how **glass2mdl** should generate glazing MDL, grounded
in what has actually been rendered and measured in the target Iray build. It
consolidates transmission, absorption, backface/frontface, coated-volumetric
structure, and frit, and it resolves items that
[mdl-compat.md](mdl-compat.md) / [physics.md](physics.md) previously listed as
*blocked pending validation*.

**Target build (everything here verified against it):** Iray for 3ds Max (Iray+)
`3.1.173473`, Iray `2025.0.3` build `387700.2665`, 3ds Max 2024, MDL `1.6`, core
standard modules only (`df`, `base`, `state`, `math`, `anno`, `tex`). Deploy under
a configured MDL search path (`%USERPROFILE%\Documents\mdl\...` is confirmed).

---

## 0. The one decision everything hangs on: planar vs solid geometry

glass2mdl emits glazing in one of two geometry modes. The `thin_walled` flag is
the switch, and almost every rule below follows from it.

| | **Planar** (`thin_walled: true`) | **Solid / volumetric** (`thin_walled: false`, `ior: color(1.52)`) |
|---|---|---|
| Represents | a single infinitely-thin surface (a plane) | a real solid lite with thickness |
| Volume/absorption | **none** — absorption folded into the base **tint** | real `volume.absorption_coefficient` in **1/metre** |
| Fresnel | modeled by `custom_curve_layer` (fitted R) | real, from `ior` |
| `backface` | **renders a different surface** (validated) → per-side reflectance | **ignored** — `surface` covers the whole boundary (validated) |
| Per-surface control (coating/frit on one face) | front vs `backface` | **Material IDs** (or normal-gating for frit) |
| Best for | the calibration control; coated glazing today; a fast single-plane asset | the architecture team's modeled IGUs; physically-real lites |

**Rule of thumb:** use **planar** for the neutral calibration reference and for
coated glazing where a single validated surface is acceptable; use **solid** when
integrating the real modeled IGU geometry, where thickness, refraction, and true
volume color matter. Both are first-class outputs.

---

## 1. Transmission (VLT) — validated

- **Measurement method (reuse this rig):** overhead photometric free light
  (uniform spherical), black environment, horizontal `Plane-Glass`, small central
  average region, matte-black receiver. Black-floor baseline = **836.294 lux**;
  VLT ratio = `avg_lux / 836.294`.
- **Products validated end-to-end:** V5227 **DGU** VLT `0.53` (measured `442.680
  lux`, `-0.13%`); V5227 **TGU** VLT `0.48` (`401.437 lux`, `+0.004%`).
- **Reciprocity:** transmission is equal from both faces (DGU `443.100` vs
  `443.099 lux`), so any front/back difference is pure reflection, not
  transmission.
- **Implication:** VLT is honored by both geometry modes; fit level from the
  measured transmittance and verify against the black-floor ratio within 2%.

## 2. Energy conservation & `custom_curve_layer` — validated

- `custom_curve_layer` **mixes** rather than adds: `w·layer + (1−w)·base`. To hold
  transmission at the measured value, **pre-divide the base tint by
  `1 − normal_reflectivity`** (already in the planar emitter).
- At normal incidence with a **matte-black receiver**, measured transmission
  equals `1 − R` almost exactly (R=0.50 → `418.126 lux` vs predicted `418.1`,
  `-0.005%`). Earlier apparent excess was scene interreflection off a non-black
  floor, not a model error.
- **A layer can only *add* reflection.** Nothing layered on glass can reflect
  *less* than the glass beneath it. Real low-e coatings reflect less than bare
  glass (Solarban 60 ≈ 11% vs ~14% uncoated), so a low-e coating must **replace
  the interface** (a transmit-only specular base + the coating) rather than sit on
  top of a reflecting glass BSDF. A single coating plane cannot reproduce a low-e
  cutsheet. Refraction survives the substitution (a transmit-only specular BSDF
  still bends light by `ior`).

## 3. Absorption — validated

- Beer-Lambert: body transmittance `t` → `σ = −ln(t)/d` **per metre**. 6 mm clear
  float at 88% Tvis gives `t ≈ 0.958`, `σ ≈ 7.2/m` (matches published values).
- **Solid mode** carries this as `volume.absorption_coefficient` (1/metre).
  **Planar mode has no volume**, so absorption is baked into the base tint.
- **Units caveat (critical):** Iray works in **metres**; a per-metre coefficient
  is only physically correct if the scene's system-unit scale is right. The
  validation kit scene is metric; the production scene is **imperial** — confirm
  the Max system unit so 6 mm reads as `0.006 m` in Iray, or volume absorption
  will be wrong. (This is why frit avoids world units entirely — see §6.)

## 4. Backface / frontface (sidedness) — validated

- **Planar / thin-walled:** `backface` renders a **genuinely different surface**
  from the front (kit test 01: red front, blue back). This is what gives planar
  mode its distinct interior reflectance — asymmetric `Rf`/`Rb` via a second
  `custom_curve_layer` stack on `backface`.
- **Solid:** `backface` is **ignored**; a solid applies `surface` across its whole
  boundary (kit test 02: all red, no blue). **So a solid cannot carry an
  asymmetric coating or one-sided frit through `backface`** — it needs Material
  IDs (§5) or normal-gating (§6).

## 5. Coated volumetric — RESOLVED: Material IDs (rule 2)

This was flagged *blocked pending validation* in mdl-compat.md / physics.md.
**It is now resolved.** The decision tree (first match wins) was: (1) `backface`,
(2) Material IDs, (3) reflection-free solid + Fresnel planes, (4) single coating
plane with documented error. Rule 1 was eliminated (§4); **rule 2 is the
production route.**

- **Kit test 03 (PASS):** two Material IDs on opposite faces of one solid give
  those faces **different surfaces**, while the shared body still absorbs.
- **Kit test 04 (characterized):** if two IDs disagree about the volume, the
  **entry (camera-facing) surface's volume wins**, deterministically (exterior
  green → transmitted RGB `(51,159,51)`; exterior amber → `(166,78,28)`; no
  blend/error).
- **Production rule:** on a shared solid, **vary only the SURFACE (coating/frit)
  per Material ID and keep the VOLUME identical on every ID.** Never assign
  conflicting volumes.
- **Implication for glass2mdl:** the coated-solid emitter that `validateForMode`
  currently refuses can be unblocked as a **Material-ID assembly** — the
  surface-2 coating rides on the ID assigned to the surface-2 face; other faces
  are plain glass with the shared body absorption. (Requires the modeled geometry
  to expose face Material IDs per the surface-numbering convention.)
- **Validated 2026-08-24 (transmission).** A synthetic 6′×6′ × 0.25″ solid lite
  with the two coating IDs (`agc_v5227_dgu_solid`, coating = `custom_curve_layer`
  over transmit-only base, shared `volume` absorption) measured **VLT 0.529** vs
  datasheet 0.53 (**−0.2%**) — matching the planar reference (442.7 lux / 836 lux
  baseline) — with **int-up = ext-up** (transmission reciprocity). So the
  Material-ID coated-solid structure reproduces the assembly transmittance. Still
  pending: the **reflectance asymmetry** Rf/Rb (gray-floor flip) and **absolute
  Rf/Rb magnitude** (near-normal mirror rig). Evidence:
  `results/evidence/transmission/2026-08-24_v5227-dgu-solid-vlt-*` ; row in
  `results/transmission/product-v5227-dgu.csv`.
- **Reflectance asymmetry — direction confirmed 2026-08-24, magnitude
  inconclusive.** Gray-floor flip on the same solid: exterior-face-down read
  brighter (41.98 vs 41.88 fc) → the **exterior face is more reflective**,
  matching Rf 0.17 > Rb 0.13. But the floor-recycling boost was **< 1 fc**, so the
  *ratio* (1.12 vs datasheet 1.31) sits at render-noise level and does **not**
  confirm the magnitude. **Still open:** absolute Rf/Rb via the near-normal mirror
  rig (the rigorous method), and/or a brighter gray floor to lift the asymmetry
  signal. Evidence: `results/evidence/reflection/2026-08-24_v5227-dgu-solid-refl-*`.

## 6. Frit — validated (all variants)

glass2mdl must emit frit across three independent axes; the user picks the
combination per product.

### 6a. Placement
- **Separate decal plane** — a thin plane floated `~0.005 in / 0.13 mm` off the
  glass carrying the frit as `cutout_opacity` (kit test 05: stable, no
  z-fighting). Use to add frit to *existing* modeled glass without touching its
  material.
- **Integrated into the glass material** — frit mixed in via `df::weighted_layer`
  (opaque ceramic over glass by the pattern weight); real glass shows through the
  gaps. No extra geometry.

### 6b. Sidedness on a solid
A solid's `surface` covers the whole boundary, so an integrated frit lands on
**both faces** unless restricted:
- **Surface-2-only via Material ID** — frit rides on the surface-2 material (the
  rule-2 route, §5).
- **Self-limiting one-sided (normal-gated)** — the material gates the frit weight
  by surface-normal direction. **Validated on a solid lite** (`kit_14`,
  `thin_walled: false`): frit on one large face, clear glass on the other. Flip
  `frit_side` sign to swap faces; combine with a Material ID to target one lite on
  a unit. **`thin_walled` must be `false` for a solid** — `thin_walled: true`
  double-sides every face and defeats the gate.

### 6c. Pattern source
- **Procedural** — coverage % + style (dots). Dot radius from coverage:
  `r = pitch · √(coverage / π)`. Coverage is exact and scale-independent.
- **Architect opacity map / bitmap** — a `texture_2d` parameter drives the
  pattern (linear gamma; white = frit; `invert` for black = frit).

### 6d. Frit scale
- **Frit is UV-based.** Absolute physical dot size in mm via world/object position
  **does not work** in this build (see §7) and **isn't required** — the spec is
  **coverage % + look**, or a supplied map. A `UVW Map` modifier is only needed if
  a guaranteed real-world size is ever demanded.

## 7. Hard rules & gotchas (learned the hard way)

1. **World/object-space physical scale FAILS.** Driving a pattern from
   `state::position()` / `state::meters_per_scene_unit()` renders the surface
   **invisible** (the call collapses to a constant in the geometry/cutout
   context). Keep procedural patterns **UV-based** (`state::texture_coordinate(0)`).
2. **MDL module caching.** Max will **not** recompile an already-loaded module
   after a file edit until a **new module filename** or a **restart**. A stale
   cached render once made a broken edit look like it worked. **Deploy every
   iteration under a fresh filename**; never trust an edit to a loaded module.
3. **`thin_walled` must match geometry.** `true` only for a genuinely thin sheet
   (plane/decal); `false` for a solid lite — otherwise every face double-sides.
4. **Material parameters are fine.** `texture_2d` params and UV/texture-driven
   `weighted_layer` weights render correctly; the earlier "invisible" failures
   were specifically world-space position (#1), not parameters.
5. **Approximations to keep (from physics.md):** Schlick 5th-power angular curve
   (cutsheets are normal-incidence only); one coating at a time; frit sits outside
   the optical fit (vision-area numbers are fitted, frit layered over the result);
   RGB per-channel until IGDB spectral import.
6. **`material_geometry.normal` in MDL source is DEAD in Iray+ 3.1 — use the
   plugin's Max-side geometry channels instead.** Two independent emissions
   rendered completely flat at any strength (2026-08-27): a hand-built
   `texture_coordinate_info` frame AND the canonical
   `coordinate_source`/`transform_coordinate` chain through
   `base::tangent_space_normal_texture`. The slot is silently ignored, same
   failure family as #1. What DOES work: the Iray+ MDL material node in Max
   exposes three Max-side map channels — geometry opacity / geometry normal /
   geometry displacement — and a hand-wired Noise map on **geometry normal**
   visibly distorts rendered reflections (field-confirmed by Jeff,
   2026-08-27). Roller wave therefore ships as a grayscale bump map that the
   apply script wires into that channel (`_wire_roller_wave` probes the
   property names). Never put normal perturbation back inside the MDL without
   a render proving it; the export-bundle test enforces a clean module.

---

## 8. Evidence index

| Area | Result | Evidence |
|---|---|---|
| Test 01 `backface` thin-walled | PASS (different surface) | mdl-compat.md 2026-08-23 |
| Test 02 `backface` solid | Ignored (whole boundary) | `results/evidence/validation-kit/2026-08-23_kit02-*` |
| Test 03 Material IDs → surfaces | PASS | `..._2026-08-24_kit03-*` |
| Test 04 conflicting ID volumes | Entry surface wins; keep volumes equal | `..._2026-08-24_kit04-*` |
| Test 05 decal offset | Stable at 0.005 in | verbal + notes |
| Frit procedural / map / integrated / one-sided | All render | `kit_10`–`kit_14` + `results/evidence/validation-kit/2026-08-24_kit08-*` |
| V5227 DGU / TGU VLT + reflectance (planar) | Validated | `results/transmission/product-v5227-*` |
| Solid Material-ID coated (V5227 DGU) | VLT 0.529 (−0.2%); reflectance direction correct, magnitude open | `results/evidence/transmission/2026-08-24_v5227-dgu-solid-vlt-*`, `.../reflection/2026-08-24_v5227-dgu-solid-refl-*` |
| **Per-lite two-solid V5227 DGU** (outer coated + inner clear) | **VLT 0.525 (−0.9%); asymmetry ratio 1.30 vs 1.31 (−0.8%)** | `results/evidence/transmission/2026-08-25_v5227-dgu-perlite-*` |
| `custom_curve_layer` energy | `T = 1 − R` at normal incidence | `results/transmission/region-average-energy-conservation.csv` |

Full narrative in [mdl-compat.md](mdl-compat.md); numeric rows in
`results/compatibility/validation-kit-results.csv` and `results/transmission/`.

---

## 9. MDL templates (proven; generator bakes product values)

Scaffolding lives in `mdl/validation_kit/` (`kit_10`–`kit_14`,
`agc_*` templates). The generator should emit product-specific baked MDLs.

### 9.1 Solid uncoated lite
```mdl
material(
    thin_walled: false,
    ior: color(1.52f),
    surface: material_surface(
        scattering: df::specular_bsdf(tint: color(1.0f), mode: df::scatter_reflect_transmit)),
    volume: material_volume(absorption_coefficient: color(SIGMA_R, SIGMA_G, SIGMA_B)));  // 1/metre
```

### 9.2 Integrated fritted glass (procedural coverage)
```mdl
float frit_dots(float coverage, float pitch_uv) {
    float radius = pitch_uv * math::sqrt(coverage / 3.14159265f);
    float3 uvw = state::texture_coordinate(0);
    float2 cell = float2(uvw.x, uvw.y) / pitch_uv;
    float2 off = (cell - math::floor(cell) - 0.5f) * pitch_uv;
    return math::length(off) < radius ? 1.0f : 0.0f;
}
// glass base + opaque ceramic mixed by the frit weight; thin_walled matches geometry.
material(
    thin_walled: false, ior: color(1.52f),
    surface: material_surface(
        scattering: df::weighted_layer(
            weight: frit_dots(COVERAGE, 0.012f),
            layer:  df::diffuse_reflection_bsdf(tint: FRIT_COLOR),
            base:   df::specular_bsdf(tint: color(1.0f), mode: df::scatter_reflect_transmit))));
```

### 9.3 Frit from an architect opacity map
```mdl
// texture_2d("<map>", ::tex::gamma_linear); float m = tex::lookup_float(map, uv);
// weight = invert ? 1-m : m;  then feed weight into weighted_layer (integrated)
// or cutout_opacity (separate decal plane).
```

### 9.4 One-sided normal-gated frit (solid)
```mdl
float facing = math::dot(state::normal(), math::normalize(FRIT_SIDE)); // >0 = frit side
float w = frit_weight * (facing > 0.0f ? 1.0f : 0.0f);
material(thin_walled: false, ior: color(1.52f),
    surface: material_surface(
        scattering: df::weighted_layer(weight: w,
            layer: df::diffuse_reflection_bsdf(tint: FRIT_COLOR),
            base:  df::specular_bsdf(tint: color(1.0f), mode: df::scatter_reflect_transmit))));
```

> **Repo note:** `FRIT_SIDE` is a world-space constant, so the gate breaks on
> sloped glazing, rotated instances, or facades facing different directions.
> Material-ID sidedness (§6b) is the robust route; normal-gating is for the
> axis-aligned case.

### 9.5 Planar coated lite (asymmetric, existing working path)
`df::custom_curve_layer(normal_reflectivity: Rf) over df::specular_bsdf(scatter_transmit)`,
base tint pre-divided by `1 − Rf`, with a second stack on `backface` carrying `Rb`.
See `mdl/templates/agc_v5227_dgu_assembly_reference.mdl`.

### 9.6 Solid coated lite via Material IDs (asymmetric; validated for transmission)
Each large face is a coating that **replaces the interface** (transmit-only base +
fitted `custom_curve_layer`); body absorption lives in the **shared `volume`**,
identical on both IDs (Test 04 rule). Assign to both face IDs, selecting the
per-face reflectance. Sizing: `σ = −ln( VLT / ((1−Rf)(1−Rb)) ) / d` (d = lite
thickness in **metres**).
```mdl
// ID-1 (exterior) face uses Rf; ID-2 (interior) face uses Rb; both share the same sigma/volume.
material(
    thin_walled: false, ior: color(1.52f),
    surface: material_surface(
        scattering: df::custom_curve_layer(
            normal_reflectivity: RVIS_THIS_FACE,   // Rf on the exterior ID, Rb on the interior ID
            grazing_reflectivity: 1.0f, exponent: 5.0f, weight: 1.0f,
            layer: df::specular_bsdf(tint: color(1.0f), mode: df::scatter_reflect),
            base:  df::specular_bsdf(tint: color(1.0f), mode: df::scatter_transmit))),
    volume: material_volume(absorption_coefficient: color(SIGMA)));  // SAME on both IDs
```
Reference: `mdl/templates/agc_v5227_dgu_solid_reference.mdl` (one material, per-face
`interior_face` bool). Validated 2026-08-24: VLT 0.529 vs 0.53; reflectance
direction correct, absolute magnitude still open (mirror rig).

> **Repo note (per-lite decision, 2026-08-24):** this validation collapsed the
> whole DGU into one 0.25″ solid — assembly-level VLT/Rf/Rb in a single lite.
> glass2mdl's volumetric mode instead emits **one material per lite** with
> per-lite values from the inverse fit, matching the modeled IGU geometry;
> inter-lite reflections then happen in the renderer. The structure above is
> what each coated lite uses, with per-lite numbers in place of assembly
> numbers. Rendering two stacked per-lite solids against the 442.7 lux planar
> reference is the outstanding empirical check.
>
> **DONE 2026-08-25 — per-lite render validated.**
> `mdl/templates/g2m_v5227_dgu.mdl` (byo_mdl repo) splits the DGU into two real
> lites: `g2m_v5227_dgu_outer` (low-iron + surface-2 low-e, fitted T 0.5746 /
> Rf 0.1429 / Rb 0.0571 / 6 mm) and `g2m_v5227_dgu_inner` (clear low-iron, `ior`
> Fresnel). Per-lite values came from fixing the inner lite at Fresnel and solving
> the two-lite combination for the coated lite. Rendered stacked: VLT 0.525
> (−0.9%) and gray-floor asymmetry ratio 1.30 vs 1.31 (−0.8%) — both axes pass.
> This is the template the per-lite emitter should generate.

---

## 10. Applying materials in 3ds Max (scriptable — confirmed 2026-08-25)

The Max side is fully automatable; a glass2mdl export can drive it end to end.
Companion scripts live in `scripts/max/` of the byo_mdl validation repo
(`discover_iray_mdl_api.py`, `glass2mdl_apply.py`, `fully_auto_build.py`).

**Iray+ MDL materials are created and parameterised by script** (proven recipe,
matches the in-house Iray-Mapper):
```python
mat = rt.Iray__Material()
rt.irpSetMaterialType(mat, type_name, enable_emission)   # loads a custom module
plist = [str(p) for p in rt.irpGetPropertyList(mat)]     # live param keys
if key in plist: rt.irpSetProperty(mat, key, value)      # set a fitted value
```
- `type_name` for a custom module is the fully-qualified MDL signature
  `mdl::<package>::<module>::<material>(<sig>)`, e.g.
  `mdl::validation_kit::g2m_v5227_dgu::g2m_v5227_dgu_outer(float,float,float,float,bool)`.
- Each MDL param appears in `irpGetPropertyList` as `<type_name>_<param>`; set it
  by unique-suffix match (never rebuild the signature). `getPropNames` does **not**
  expose MDL params — only the `irp*` API does.
- Feature-detect these three: `irpSetMaterialType`, `irpGetPropertyList`,
  `irpSetProperty`.

**Ship a manifest in the export ZIP** so the apply script binds with zero manual
steps (shape from `V5227_DGU_MANIFEST` in `glass2mdl_apply.py`):
```
{ "<export_prefix>": {
    "by_position": {                       # per-lite, keyed outer/inner/center/...
      "outer": { "type_name": "mdl::…::…_outer(<sig>)",
                 "params": {…}, "slot_params": {"exterior":{…}, "interior":{…}} },
      "inner": { "type_name": "mdl::…::…_inner(<sig>)", "params": {…} } } } }
```
The apply script maps object name/layer → prefix, tags faces (ID 1 exterior / 2
interior / 3 edge), and builds one Multi-Sub per (prefix, lite position) with the
scripted materials. Work scales with glazing **types**, not IGU count.

**Deployment + gotchas:** modules load from a configured MDL search path
(`%USERPROFILE%\Documents\mdl\<package>\`). The Max Python bytecode cache
(`__pycache__/*.cpython-310.pyc`; Max 2024 = Python 3.10) can shadow an edited
apply script — delete it or start a fresh Max session after edits. MDL module
caching still needs a fresh module filename per iteration (§7.2).
