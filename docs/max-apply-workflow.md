# Applying glass2mdl materials to modeled IGUs in 3ds Max

How a project with hundreds or thousands of IGU solids and 4–10 glazing types
gets from an architecture team's model to fully bound glass2mdl materials —
without anyone clicking through individual IGUs. Work scales with the number
of glazing **types**, never with the number of IGUs.

The tooling is two Python scripts (pymxs, 3ds Max 2024):

| | |
|---|---|
| [`scripts/max/discover_iray_mdl_api.py`](../scripts/max/discover_iray_mdl_api.py) | one-time, read-only: reveals whether Iray+ MDL materials can be created by script |
| [`scripts/max/glass2mdl_apply.py`](../scripts/max/glass2mdl_apply.py) | the pipeline: tag faces → QA visually → bind materials |

Scripting idioms follow the in-house
[Iray-Mapper](https://github.com/jjathompson4/Iray-Mapper) tool (note: the
GitHub copy is out of date — the workstation has the current version; its
`skills/02_IRAY_API_CHEATSHEET.md` is the API ground truth).

## What arrives, and what to ask for

**The 95% case: the architects deliver the facade already modeled**, usually
as correct per-lite geometry. The pipeline is built for that — the user's job
is to *identify* the glazing (by viewport selection, or `find_glazing()`'s
scene-wide scan), not to prepare it. Two things to confirm with the team,
both usually already true:

1. **Each lite as its own solid**, accurate to the build-up (they do this on
   request). Not the whole IGU as one box; not surfaces.
2. **Glazing type expressed in the object name or layer** ("CW-Type-A",
   "GL-01", any consistent substring) — *nice to have*, not required. With it,
   bind()'s pattern map resolves types automatically; without it,
   `assign_type()` stamps types by selection instead.

Explicitly **not** needed from them: per-face materials, Material IDs, UV
mapping, or any Max-specific setup. Everything face-level happens scripted on
the Max side.

## Import path

Any of Revit link, FBX/DWG export, or Rhino import works — the scripts are
geometry-first and read nothing import-specific. Names and layers survive all
three paths and drive type selection. Where the path preserves instancing
(Revit link, Rhino blocks), tagging one instance's base object tags them all —
a bonus, not a requirement.

Two Max-side checks before starting:

- **System units.** Volumetric absorption is per metre; the scene scale must
  be honest (a 6 mm lite must really be 0.006 m). Imperial scenes are fine —
  the scripts convert via `units.decodeValue` — but a mis-scaled import is
  wrong everywhere, not just here.
- **Geometry class.** Imports usually arrive as Editable Mesh or Editable
  Poly, which the scripts handle natively. Revit sometimes produces Body
  Objects — pass `convert=True` to `tag()` to collapse those (destructive;
  save first).

## Step 0 — one-time API discovery (workstation)

Hand-create one Iray+ MDL material in the material editor (any validation-kit
or glass2mdl material), assign it to a selected object, then run
`discover_iray_mdl_api.py`. It writes `discover_report.txt` with every class
and property name the installed Iray+ exposes to scripting.

This settles the one question the public Iray+ docs leave open: whether a
script can create a material backed by a custom `.mdl` module.

**Result (2026-08-25): YES — Iray+ MDL is fully scriptable.** A fresh
`Iray__Material()` loads a custom module via `irpSetMaterialType(mat,
"mdl::<pkg>::<module>::<material>(<sig>)", emit)` and its params are set with
`irpSetProperty` (guarded against `irpGetPropertyList`). So Bind's **Automatic**
mode is the path; the drag fallback is not needed. Recipe + manifest format in
[iray-findings.md](iray-findings.md) §10.

## The pipeline

**Scripting > Run Script on `glass2mdl_apply.py` opens the GUI** — the whole
pipeline as buttons in workflow order with a live log. Selection-first, per
Jeff's field test: the user selects their glazing and **Check my selection**
probes each object with a per-object verdict (scene scanning remains as
"Find candidates for me"); then Tag + color check → Flip → choose
`bind_manifest.json` → Bind. Choosing the manifest prints the expected
folder layout and creates a probe material immediately, so a mis-placed
export folder is caught with a placement message BEFORE binding (an
unresolved module used to bind pink). With a single-type manifest the type
controls stay hidden and Bind stamps every tagged lite; the mark-type
controls appear only for multi-type manifests. Detection probes any geometry
class via a world-space snapshot; tagging collapses to Editable Poly when
needed (undoable, on by default). Face ID convention throughout — **ID 1
exterior, ID 2 interior, ID 3 edges** (extends validation-kit test 03).

The listener API remains for scripted use:

### 1. Identify

```python
import glass2mdl_apply as ga
ga.find_glazing()        # scene-wide scan; selects the candidates for review
```

Every object passing the geometric lite test qualifies: a thin solid with two
large opposite faces, wide in *both* in-plane directions (mullion and frame
profiles fail the width test). Name/layer hints and multi-lite stacking only
raise confidence — the report calls out low-confidence candidates (geometry
as the only evidence) for a second look. Nothing is modified; review the
selection in the viewport, deselect false positives, and move on. Manual
selection works exactly as well when the user already knows their glazing.

### 2. Tag

```python
ga.tag()                 # the reviewed selection — or ga.tag("*gl-01*")
```

Per object: finds the two largest opposite coplanar face groups (triangulated
imports are re-clustered, so FBX meshes work), assigns IDs, groups lites into
IGUs by proximity and orientation, orders them outer→inner, and stamps
everything as user properties (`g2m_igu`, `g2m_position` — positions match
the exporter's `outer`/`inner`/… naming). Prints what it skipped and why.

The exterior/interior guess uses the glazing centroid. On a closed building
it is mostly right; on a single flat facade it is genuinely ambiguous, so the
script picks one **consistent** side and says so — which is all the next step
needs.

### 3. QA — the human minute

```python
ga.qa()              # red = exterior, blue = interior, green = edges
ga.flip_selected()   # select anything wrong; its whole IGU flips
ga.flip_all()        # a flat facade guessed backwards flips in one call
```

Orbit the model: **exterior must read red everywhere.** This converts the
unsolvable "which way is out" heuristic problem into a 60-second visual pass.
Flipping swaps face IDs *and* reverses lite positions (outer↔inner), so a
flip stays consistent for Bind.

### 4. Bind

```python
# automatic (Iray+ scripting confirmed 2026-08-25) — fills slots with MDL mats:
ga.bind({"*gl-01*": "v5227_dgu"},
        material_factory=ga.make_iray_mdl_factory(ga.V5227_DGU_MANIFEST))
# or leave material_factory off for empty slots + the manual drag fallback:
ga.bind({"*gl-01*": "v5227_dgu", "*gl-02*": "clear_igu"})
```

Types resolve per lite in order: the `assign_type()` stamp first (select all
IGUs of one type, `ga.assign_type("v5227_dgu")`, repeat — for models whose
naming doesn't identify types), then the name/layer pattern map. Either path
alone is enough; use whichever fits the model, or both.

Builds one Multi-Sub-Object per (type, lite position) — slot 1 exterior face,
slot 2 interior, slot 3 edges — and assigns it to every matching lite. Two
modes:

- **Automatic — CONFIRMED + IMPLEMENTED (2026-08-25).** Pass
  `material_factory=make_iray_mdl_factory(manifest)`; the factory creates each
  Iray+ MDL material by script (`Iray__Material` + `irpSetMaterialType` +
  `irpSetProperty`) and fills the slots directly — zero manual steps. The manifest
  (per-lite `by_position` specs) should ship in the glass2mdl export ZIP; see
  `V5227_DGU_MANIFEST` in `glass2mdl_apply.py`.
- **Fallback** (only if a build lacks the Iray+ scripting API): slots are created
  empty and named; drag each glass2mdl material from the browser into its slot.
  That is one drag per slot per type — 4–10 types, once per project.

Uncoated lites don't strictly need per-face materials; dragging the same
uncoated material into slots 1–3 is correct. Per-face material names for
coated lites arrive with the coated-solid emitter (HANDOFF work queue item 1).

## Trying it without a real model

```python
ga.build_test_scene()   # three double-lite IGUs + one rotated copy
ga.tag(); ga.qa()
```

## Workstation validation protocol

Record results as a session in [mdl-compat.md](mdl-compat.md):

1. Run step 0; paste `discover_report.txt` into a glass2mdl session — this
   decides Bind's mode and whether a `material_factory` gets written.
2. `build_test_scene()` → `tag()` → `qa()`: red-out/blue-in on all four IGUs
   (at most one `flip_all()`), including the rotated one. `bind()` with
   validation-kit materials; render to confirm per-face assignment.
3. A real imported model (any path): `tag(pattern)` → `qa()` → flip pass →
   `bind()` with the existing `agc_v5227` materials. Note tag/skip counts,
   wrong-guess rate, and anything Body-Object-shaped.

## Open items

- ~~Discovery result → automatic Bind factory (or confirmed fallback).~~
  **DONE 2026-08-25** — Iray+ MDL is scriptable; `make_iray_mdl_factory` is
  implemented and render-validated on the per-lite V5227 DGU.
- ~~Combined-mesh imports (Revit "combine by material" merges a type into one
  mesh): same clustering per mesh *element* — v2.~~ **DONE (first field
  model, TGU facade):** `tag()` splits a combined object into per-lite
  objects — disconnected shells that individually pass the lite test are
  detached (undoable), framing/setting blocks stay behind untagged (hollow
  frame caps rejected by a bounding-fill test, narrow shells by
  `min_pane_mm`). Shells *welded* to framing (shared vertices) still cannot
  be separated and are skipped with a shell-count message.
- Productizing: shipping a per-export apply script inside the ZIP (a
  `kind: "maxscript"` file in `buildExport`) once this workflow is validated
  and the coated-solid emitter fixes the per-face material names.
- Module caching: when iterating on materials, remember Max serves a stale
  module until the filename changes or Max restarts
  ([iray-findings.md](iray-findings.md) §7.2).
