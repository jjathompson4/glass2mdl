# 3ds Max scripts

Tooling that runs inside 3ds Max 2024 on the render workstation. Synced with
the byo_mdl validation repo (`c:/Users/JETHOMPSON/Documents/GitHub/byo_mdl`)
on 2026-08-25 — when editing, check which side is newer first.

## glass2mdl apply pipeline (Python / pymxs)

| | |
|---|---|
| `glass2mdl_apply.py` | The pipeline: `tag()` face Material IDs geometrically → `qa()` red/blue visual check → `bind()` per-type Multi-Subs. Automatic MDL material creation via `make_iray_mdl_factory` (proven 2026-08-25); `V5227_DGU_MANIFEST` is the render-validated per-lite example. See [docs/max-apply-workflow.md](../../docs/max-apply-workflow.md). |
| `fully_auto_build.py` | One-shot demo: test scene → tag → bind with the per-lite V5227 DGU manifest. Run via Scripting > Run Script on an empty scene. |
| `discover_iray_mdl_api.py` | Read-only survey of the Iray+ scripting API, including the creation round-trip proof. Re-run on a new Iray+/Max build before trusting the factory there. |
| `discover_report.txt` | The 2026-08-25 survey output from the workstation — ground truth for the API surface (classes, irp param keys, PASS on scripted creation). |

Gotcha: Max caches imported Python modules per session (`__pycache__`
included) — `fully_auto_build.py` purges `glass2mdl_apply` from `sys.modules`
before importing, but after editing scripts prefer a fresh Max session.

## byo_mdl measurement rigs (MaxScript)

Companions to the byo_mdl transmission-harness scene
(`max/glazing-transmission-harness.max`, workstation) — they expect its node
names (`Plane-Glass`, `Plane-Ground`, `Plane-Emissive`, `Camera001`). Kept
here as reference for the measurement methodology.

| | |
|---|---|
| `glazing_harness_tool.ms` | Assisted panel for the transmission rig: validate scene, baseline/sample states, Analysis (illuminance) vs Photoreal, renders. |
| `setup_reflectance_check.ms` | The near-normal mirror rig (`BYOReflectanceCheck`) — the still-open absolute Rf/Rb measurement uses this. |
| `setup_modeled_igu.ms` | Synthetic modeled-DGU builder (`BYOModeledIGU`) with coating-plane offset sweep — superseded for coatings by the Material-ID route, kept for the offset methodology. |
