"""glass2mdl — Iray+ MDL scripting API discovery (read-only).

Answers the one question the public Iray+ docs leave open: can a script create
a material backed by a custom .mdl module from an MDL search path, and if so,
through which class and which properties?

Run this ON THE WORKSTATION, inside 3ds Max 2024, AFTER hand-creating one
Iray+ MDL material (any glass2mdl or validation-kit material) in the material
editor and assigning it to a selected object (or leaving it in the active
Slate/Compact editor slot).

    Scripting > Run Script... > discover_iray_mdl_api.py

It inspects the material and prints every class and property name it can see,
to the listener and to `discover_report.txt` next to this script (falling back
to the Max temp directory). Paste that file back into a glass2mdl session —
its contents decide whether `glass2mdl_apply.py` can bind materials fully
automatically or needs the one-drag-per-type fallback.

Does not modify the scene: candidate material classes are instantiated in
memory only (for schema inspection) and are never assigned to a node or saved.
"""

import os
import sys
import traceback

try:
    from pymxs import runtime as rt
except ImportError:  # keeps the file importable/compilable outside Max
    rt = None

LINES = []


def out(text=""):
    LINES.append(text)
    print(text)


def guarded(label, fn):
    """Run fn, report its value or the exception — never abort the survey."""
    try:
        value = fn()
        out(f"  {label}: {value!r}")
        return value
    except Exception as exc:  # noqa: BLE001 - survey must survive anything
        out(f"  {label}: <error: {exc}>")
        return None


def survey_classes():
    out("== Material / texture classes matching 'iray' or 'mdl' ==")
    for collection_name in ("material", "textureMap"):
        try:
            collection = getattr(rt, collection_name)
            names = [str(c) for c in collection.classes]
        except Exception as exc:  # noqa: BLE001
            out(f"  <could not enumerate {collection_name}.classes: {exc}>")
            continue
        hits = [n for n in names if "iray" in n.lower() or "mdl" in n.lower()]
        out(f"  {collection_name}.classes ({len(names)} total):")
        for name in hits or ["<no matches>"]:
            out(f"    {name}")
    out()


def survey_candidate_classes():
    """Instantiate each MDL-capable class in memory and dump its scriptable
    schema — this is what decides whether bind() can create materials directly.
    Nothing here is assigned to a node or saved."""
    out("== Candidate MDL classes — in-memory schema (never assigned/saved) ==")
    candidates = []
    try:
        for c in rt.material.classes:
            name = str(c)
            if "mdl" in name.lower() or "iray" in name.lower():
                candidates.append(c)
    except Exception as exc:  # noqa: BLE001
        out(f"  <could not enumerate material.classes: {exc}>")
    # the one MDL-backed map class matters for frit binding later
    try:
        for c in rt.textureMap.classes:
            if str(c) == "MDLFunction":
                candidates.append(c)
    except Exception:  # noqa: BLE001
        pass

    seen = set()
    for cls in candidates:
        name = str(cls)
        if name in seen:
            continue
        seen.add(name)
        out(f"  -- {name} --")
        try:
            inst = cls()
        except Exception as exc:  # noqa: BLE001 - some classes may refuse bare construction
            out(f"    <cannot instantiate: {exc}>")
            continue
        try:
            out(f"    classOf: {rt.classOf(inst)!r}")
        except Exception as exc:  # noqa: BLE001
            out(f"    classOf: <error: {exc}>")
        try:
            props = [str(p) for p in rt.getPropNames(inst)]
            out(f"    getPropNames ({len(props)}): {', '.join(props) or '<none>'}")
        except Exception as exc:  # noqa: BLE001
            out(f"    <getPropNames failed: {exc}>")
        try:
            irp = [str(p) for p in rt.irpGetPropertyList(inst)]
            out(f"    irpGetPropertyList ({len(irp)}): {', '.join(irp) or '<none>'}")
        except Exception as exc:  # noqa: BLE001
            out(f"    irpGetPropertyList: <{exc}>")
    out()


# Known-good product module surveyed 2026-08-25; used to prove that
# irpSetMaterialType accepts a custom `mdl::` type on a fresh Iray+ material.
DEFAULT_CONFIRM_TYPE = (
    "mdl::validation_kit::agc_v5227_dgu_solid_reference::"
    "agc_v5227_dgu_solid(float,float,float,float,bool)"
)


def confirm_creation(type_name=DEFAULT_CONFIRM_TYPE):
    """Prove the automatic path end-to-end: create an Iray+ material, load a
    custom MDL type into it, and read its parameters back. In-memory only
    (never assigned to a node or saved). This is the exact round-trip that
    glass2mdl_apply.bind()'s material_factory will use."""
    out("== Creation round-trip (Iray__Material + irpSetMaterialType) ==")
    out(f"  type_name: {type_name}")
    if not hasattr(rt, "irpSetMaterialType"):
        out("  <irpSetMaterialType unavailable — cannot confirm automatic path>")
        out()
        return
    try:
        mat = rt.Iray__Material()
    except Exception as exc:  # noqa: BLE001
        out(f"  <Iray__Material() failed: {exc}>")
        out()
        return
    try:
        rt.irpSetMaterialType(mat, type_name, False)
        out("  irpSetMaterialType: OK")
    except Exception as exc:  # noqa: BLE001
        out(f"  irpSetMaterialType FAILED: {exc}")
        out("  => this module cannot be loaded by script this way; investigate.")
        out()
        return
    try:
        props = [str(p) for p in rt.irpGetPropertyList(mat)]
    except Exception as exc:  # noqa: BLE001
        out(f"  <irpGetPropertyList failed after set: {exc}>")
        out()
        return
    mdl_props = [p for p in props if p.startswith("mdl::")]
    out(f"  irpGetPropertyList after set: {len(props)} total, {len(mdl_props)} mdl::")
    for p in mdl_props or ["<no mdl:: params — the type may not have loaded>"]:
        try:
            value = rt.irpGetProperty(mat, p) if p.startswith("mdl::") else None
        except Exception as exc:  # noqa: BLE001
            value = f"<error: {exc}>"
        out(f"    {p} = {value!r}")
    if mdl_props:
        out("  RESULT: PASS — scripted creation works; bind() can use a factory.")
    else:
        out("  RESULT: type set but no mdl:: params exposed — investigate.")
    out()


def find_target_material():
    """Selected object's material first, then the active editor slot."""
    try:
        if rt.selection.count > 0:
            mat = rt.selection[0].material
            if mat is not None:
                out(f"Target: material of selected object '{rt.selection[0].name}'")
                return mat
    except Exception:  # noqa: BLE001
        pass
    try:
        mat = rt.medit.GetCurMtl()
        if mat is not None:
            out("Target: active material editor slot")
            return mat
    except Exception:  # noqa: BLE001
        pass
    return None


def survey_material(mat, depth=0):
    indent = "  " * depth
    out(f"{indent}== Material survey ==")
    guarded("classOf", lambda: rt.classOf(mat))
    guarded("superClassOf", lambda: rt.superClassOf(mat))
    guarded("name", lambda: mat.name)

    out(f"{indent}-- getPropNames --")
    props = guarded("getPropNames", lambda: list(rt.getPropNames(mat))) or []
    for prop in props:
        pname = str(prop)
        guarded(
            f"{pname} (value, class)",
            lambda p=prop: (rt.getProperty(mat, p), rt.classOf(rt.getProperty(mat, p))),
        )

    out(f"{indent}-- irpGetPropertyList (Iray+ view of the same material) --")
    irp_props = guarded("irpGetPropertyList", lambda: list(rt.irpGetPropertyList(mat)))
    if irp_props:
        for prop in irp_props:
            guarded(f"irp {prop}", lambda p=prop: rt.irpGetProperty(mat, str(p)))

    # Multi-Sub wrappers: survey each sub-material one level down, since the
    # MDL-backed class may be sitting in a slot rather than on the node.
    try:
        if rt.isKindOf(mat, rt.MultiMaterial) and depth == 0:
            for i in range(int(mat.numsubs)):
                sub = mat.materialList[i]
                if sub is not None:
                    out()
                    out(f"-- Multi-Sub slot {i + 1} --")
                    survey_material(sub, depth=1)
    except Exception:  # noqa: BLE001
        pass


def report_path():
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        if os.path.isdir(here):
            return os.path.join(here, "discover_report.txt")
    except NameError:
        pass
    return os.path.join(str(rt.getDir(rt.name("temp"))), "discover_report.txt")


def main():
    if rt is None:
        print("pymxs not available — run this inside 3ds Max.")
        return

    out("glass2mdl Iray+ MDL API discovery")
    guarded("3ds Max version", lambda: rt.maxVersion())
    guarded("Iray+ API present (irpGetPropertyList)", lambda: hasattr(rt, "irpGetPropertyList"))
    out()

    survey_classes()
    survey_candidate_classes()
    confirm_creation()

    mat = find_target_material()
    if mat is None:
        out("No target material found.")
        out("Create an Iray+ MDL material in the material editor, assign it to a")
        out("selected object (or keep it in the active slot), and run this again.")
    else:
        survey_material(mat)

    path = report_path()
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(LINES) + "\n")
        out()
        out(f"Report written to: {path}")
    except OSError:
        out()
        out("Could not write the report file — copy the listener output instead.")
        traceback.print_exc()


if __name__ == "__main__":
    main()
