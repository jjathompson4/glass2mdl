"""glass2mdl — apply per-face Material IDs and materials to modeled IGUs.

3ds Max 2024, Python/pymxs. Work scales with glazing TYPES, not IGU count:
face tagging is geometric, QA is one visual pass, material creation happens
once per (type, lite position).

Face ID convention (extends validation-kit test 03):
    ID 1 = exterior large face
    ID 2 = interior large face
    ID 3 = edge faces

Scripting > Run Script on this file OPENS A WINDOW that walks the pipeline:
Scan > Tag + color check > flip anything backwards > choose the exported
bind_manifest.json > Bind. That is the normal path; no listener needed.

The same pipeline is scriptable from the listener:

    import glass2mdl_apply as ga
    ga.build_test_scene()        # optional: synthetic boxes to try it on
    ga.find_glazing()            # 95% case: scan an architect-delivered model,
                                 # auto-identify lite-shaped solids, select them
    #   ...review the selection in the viewport, deselect false positives...
    ga.tag()                     # tag current selection (or ga.tag("*glass*"))
    ga.qa()                      # red=exterior / blue=interior / green=edges
    ga.flip_selected()           # exterior/interior guessed wrong? select, flip
    ga.flip_all()                # ...or flip every tagged IGU at once
    ga.assign_type("v5227_dgu")  # stamp the type on the current selection when
                                 # names/layers don't identify the glazing type
    ga.bind({"*curtain*": "v5227_dgu"})   # per-type Multi-Sub materials
    # automatic (Iray+ MDL discovery passed 2026-08-25): fills the slots with
    # scripted Iray+ MDL materials instead of empty drag targets --
    ga.bind({"*curtain*": "v5227_dgu"},
            material_factory=ga.make_iray_mdl_factory(ga.EXAMPLE_MANIFEST))
    ga.report()                  # what is tagged, grouped how

The exterior/interior guess uses the glazing centroid, which is ambiguous for
a single flat facade — that is what qa() + flip is for: orient the model,
exterior must read red, flip what is wrong. Consistency matters more than the
first guess being right.

v1 scope: each lite is a separate solid object (Editable Poly or Editable
Mesh; pass convert=True to collapse other geometry). Combined-mesh imports
(Revit "combine by material") are v2.
"""

import fnmatch
import math

try:
    from pymxs import runtime as rt
except ImportError:  # keeps the file importable/compilable outside Max
    rt = None

# Scripting > Run Script executes this file in Max's shared __main__
# namespace, where other tooling is free to have bound plain names over the
# builtins -- on real installs `max` arrives as a MODULE, which silently
# shadows the builtin for every function defined here ("'module' object is
# not callable"). Everything below calls these explicit aliases instead, so
# no ambient name can break the geometry code.
import builtins as _builtins

_min = _builtins.min
_max = _builtins.max

ID_EXTERIOR = 1
ID_INTERIOR = 2
ID_EDGE = 3

# Same hues as the validation kit, so red/blue already mean front/back to us.
QA_COLORS = {
    ID_EXTERIOR: ("exterior (ID1)", (230, 26, 26)),
    ID_INTERIOR: ("interior (ID2)", (26, 51, 230)),
    ID_EDGE: ("edges (ID3)", (26, 204, 51)),
}

PROP_TAGGED = "g2m_tagged"
PROP_IGU = "g2m_igu"
PROP_POSITION = "g2m_position"
PROP_TYPE = "g2m_type"

# Matches litePositionNames() in src/engine/mdl/naming.ts — material names in
# the export are `${prefix}_${position}`, so these must not drift.
def lite_position_names(count):
    if count == 1:
        return ["monolithic"]
    if count == 2:
        return ["outer", "inner"]
    if count == 3:
        return ["outer", "center", "inner"]
    return ["lite%d" % (i + 1) for i in range(count)]


# --- small vector helpers (plain tuples; one pymxs round-trip per vertex) ---

def _v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

def _v_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])

def _v_scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)

def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

def _length(a):
    return math.sqrt(_dot(a, a))

def _normalize(a):
    n = _length(a)
    return (0.0, 0.0, 0.0) if n < 1e-12 else _v_scale(a, 1.0 / n)

def _v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _mm(value):
    """Millimetres in system units — scenes here are often imperial."""
    return float(rt.units.decodeValue("%gmm" % value))


# --- geometry access -------------------------------------------------------

def _vert_transform(obj, sample):
    """polyop/mesh vert space differs by access path and Max version; decide
    empirically by which interpretation lands nearer the node's world center."""
    tm = obj.objectTransform
    n = len(sample)
    c = (sum(p.x for p in sample) / n, sum(p.y for p in sample) / n,
         sum(p.z for p in sample) / n)
    cw = rt.Point3(c[0], c[1], c[2]) * tm
    center = obj.center
    d_raw = _length(_v_sub(c, (center.x, center.y, center.z)))
    d_tm = _length(_v_sub((cw.x, cw.y, cw.z), (center.x, center.y, center.z)))
    return tm if d_tm < d_raw else None


def _world_faces(obj):
    """Return (kind, faces) where faces is a list of world-space vertex loops,
    index-aligned with the object's real faces. None if unsupported."""
    cls = rt.classOf(obj)
    loops = []
    if cls == rt.Editable_Poly:
        kind = "poly"
        nf = int(rt.polyop.getNumFaces(obj))
        raw = []
        for f in range(1, nf + 1):
            idxs = list(rt.polyop.getFaceVerts(obj, f))
            raw.append([rt.polyop.getVert(obj, int(v)) for v in idxs])
    elif cls == rt.Editable_mesh:
        kind = "mesh"
        m = obj.mesh
        nf = int(m.numfaces)
        raw = []
        for f in range(1, nf + 1):
            face = rt.getFace(m, f)
            raw.append([rt.getVert(m, int(i)) for i in (face.x, face.y, face.z)])
    else:
        return None, None

    sample = [v for loop in raw[: _min(len(raw), 8)] for v in loop]
    tm = _vert_transform(obj, sample)
    for loop in raw:
        if tm is not None:
            loop = [p * tm for p in loop]
        loops.append([(p.x, p.y, p.z) for p in loop])
    return kind, loops


def _face_geometry(loop):
    """Newell normal (handles n-gons), area, and centroid of one vertex loop."""
    nx = ny = nz = 0.0
    for i, a in enumerate(loop):
        b = loop[(i + 1) % len(loop)]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    n = (nx, ny, nz)
    area = _length(n) * 0.5
    cx = sum(p[0] for p in loop) / len(loop)
    cy = sum(p[1] for p in loop) / len(loop)
    cz = sum(p[2] for p in loop) / len(loop)
    return _normalize(n), area, (cx, cy, cz)


def _cluster_faces(loops, plane_tol):
    """Group coplanar same-direction faces; imports triangulate, so one lite
    face arrives as many triangles that must be summed before comparing."""
    clusters = []
    for idx, loop in enumerate(loops):
        n, area, c = _face_geometry(loop)
        if area <= 0.0:
            continue
        d = _dot(n, c)
        placed = False
        for cl in clusters:
            if _dot(n, cl["n"]) > 0.999 and abs(_dot(cl["n"], c) - cl["d"]) < plane_tol:
                cl["faces"].append(idx + 1)
                cl["area"] += area
                cl["center"] = _v_add(cl["center"], _v_scale(c, area))
                cl["weight"] += area
                placed = True
                break
        if not placed:
            clusters.append({"n": n, "d": d, "faces": [idx + 1], "area": area,
                             "center": _v_scale(c, area), "weight": area})
    for cl in clusters:
        cl["center"] = _v_scale(cl["center"], 1.0 / cl["weight"])
    return clusters


def _snapshot_loops(obj, max_faces):
    """World-space triangle loops for ANY renderable node, via snapshotAsMesh.

    Detection only: triangle indices are NOT aligned with the node's own
    faces, so tagging still needs the node collapsed to Editable Poly/Mesh.
    This is what lets find_glazing() see Body Objects, modifier stacks, and
    every other import class without touching the scene.
    """
    try:
        m = rt.snapshotAsMesh(obj)
    except Exception:  # noqa: BLE001
        return None, "not snapshottable (non-renderable object)"
    try:
        nf = int(m.numfaces)
        if nf == 0:
            return None, "no faces"
        if nf > max_faces:
            return None, "denser than %d faces" % max_faces
        loops = []
        for f in range(1, nf + 1):
            face = rt.getFace(m, f)
            loops.append([(p.x, p.y, p.z) for p in
                          (rt.getVert(m, int(i)) for i in (face.x, face.y, face.z))])
    finally:
        try:
            rt.free(m)
        except Exception:  # noqa: BLE001
            pass
    return loops, None


def _probe_lite(obj, plane_tol, max_thickness, max_faces):
    """Class-agnostic lite test for detection (see _snapshot_loops)."""
    loops, why = _snapshot_loops(obj, max_faces)
    if loops is None:
        return None, why
    rec, why = _analyze_loops(loops, plane_tol, max_thickness)
    if rec is None:
        return None, why
    rec["obj"] = obj
    return rec, None


def _analyze_lite(obj, plane_tol, max_thickness):
    """Face-index-aligned analysis for tagging: Editable Poly/Mesh only."""
    kind, loops = _world_faces(obj)
    if loops is None:
        return None, "unsupported class %s (needs collapsing to Editable Poly)" % rt.classOf(obj)
    rec, why = _analyze_loops(loops, plane_tol, max_thickness)
    if rec is None:
        return None, why
    rec["obj"] = obj
    rec["kind"] = kind
    return rec, None


def _analyze_loops(loops, plane_tol, max_thickness):
    clusters = _cluster_faces(loops, plane_tol)
    if len(clusters) < 3:
        return None, "fewer than 3 planar face groups — not a solid lite"
    clusters.sort(key=lambda c: c["area"], reverse=True)
    a, b = clusters[0], clusters[1]
    if _dot(a["n"], b["n"]) > -0.98:
        return None, "two largest face groups are not opposite"
    if b["area"] < 0.5 * a["area"]:
        return None, "largest opposite faces differ too much in area"
    thickness = abs(_dot(a["n"], _v_sub(a["center"], b["center"])))
    if thickness > max_thickness:
        return None, "thickness %.1f exceeds the lite limit" % thickness
    big = set(a["faces"]) | set(b["faces"])
    edges = [f for cl in clusters[2:] for f in cl["faces"] if f not in big]
    # In-plane extents of the big face: a lite is large in BOTH directions,
    # while a mullion/frame profile passes every test above yet is narrow in
    # one — find_glazing() rejects on this, tag() trusts the user's selection.
    u = _normalize(_v_cross(a["n"], (0.0, 0.0, 1.0) if abs(a["n"][2]) < 0.9
                            else (1.0, 0.0, 0.0)))
    v = _v_cross(a["n"], u)
    us, vs = [], []
    for fi in a["faces"]:
        for p in loops[fi - 1]:
            us.append(_dot(p, u))
            vs.append(_dot(p, v))
    extent_min = _min(_max(us) - _min(us), _max(vs) - _min(vs))
    return {
        "extent_min": extent_min,
        "axis": a["n"],
        "center": ((a["center"][0] + b["center"][0]) / 2,
                   (a["center"][1] + b["center"][1]) / 2,
                   (a["center"][2] + b["center"][2]) / 2),
        "face_area": a["area"], "thickness": thickness,
        "side_a": {"n": a["n"], "faces": a["faces"]},
        "side_b": {"n": b["n"], "faces": b["faces"]},
        "edges": edges,
    }, None


def _set_face_ids(rec, assignments):
    """assignments: list of (face_list, mat_id)."""
    obj = rec["obj"]
    if rec["kind"] == "poly":
        for faces, mat_id in assignments:
            if faces:
                rt.polyop.setFaceMatID(obj, faces, mat_id)
    else:
        m = obj.mesh
        for faces, mat_id in assignments:
            for f in faces:
                rt.setFaceMatID(m, f, mat_id)
        obj.mesh = m
    rt.update(obj)


# --- IGU grouping ----------------------------------------------------------

def _group_igus(records, axial_gap, lateral_factor):
    groups = []
    for rec in records:
        placed = False
        for g in groups:
            ref = g[0]
            if abs(_dot(rec["axis"], ref["axis"])) < 0.98:
                continue
            delta = _v_sub(rec["center"], ref["center"])
            axial = abs(_dot(delta, ref["axis"]))
            lateral = math.sqrt(_max(_dot(delta, delta) - axial * axial, 0.0))
            radius = math.sqrt(_max(rec["face_area"], ref["face_area"]))
            if axial < axial_gap and lateral < lateral_factor * radius:
                g.append(rec)
                placed = True
                break
        if not placed:
            groups.append([rec])
    return groups


def _pick_exterior(groups):
    """Orient each IGU's axis toward 'outside'. Centroid heuristic; degrades
    to a globally consistent side (for flat single facades) with a warning."""
    all_centers = [r["center"] for g in groups for r in g]
    n = len(all_centers)
    centroid = (sum(c[0] for c in all_centers) / n,
                sum(c[1] for c in all_centers) / n,
                sum(c[2] for c in all_centers) / n)
    confident = 0
    axes = []
    for g in groups:
        gc = g[0]["center"]
        ref = _normalize(_v_sub(gc, centroid))
        d = _dot(g[0]["axis"], ref)
        axis = g[0]["axis"] if d >= 0 else _v_scale(g[0]["axis"], -1.0)
        if abs(d) > 0.3:
            confident += 1
        axes.append(axis)
    if confident < _max(1, len(groups) // 2):
        # Flat facade: centroid sits in the glazing plane, every dot ~ 0.
        # Fall back to one consistent side and let qa() + flip_all() decide.
        base = axes[0]
        axes = [a if _dot(a, base) >= 0 else _v_scale(a, -1.0) for a in axes]
        print("g2m: exterior direction ambiguous (flat facade?) — picked a "
              "consistent side. Check qa(); flip_all() reverses everything.")
    for g, axis in zip(groups, axes):
        for rec in g:
            rec["ext_axis"] = axis
    return groups


# --- tagged-object bookkeeping ---------------------------------------------

def _tagged_objects():
    out = []
    for obj in rt.objects:
        try:
            if rt.getUserProp(obj, PROP_TAGGED) == 1 or str(rt.getUserProp(obj, PROP_TAGGED)) == "1":
                out.append(obj)
        except Exception:  # noqa: BLE001
            continue
    return out


def _candidates(pattern):
    if pattern:
        hits = []
        for obj in rt.objects:
            name = str(obj.name).lower()
            layer = ""
            try:
                layer = str(obj.layer.name).lower()
            except Exception:  # noqa: BLE001
                pass
            if fnmatch.fnmatch(name, pattern.lower()) or fnmatch.fnmatch(layer, pattern.lower()):
                hits.append(obj)
        return hits
    return list(rt.selection)


# --- public entry points ---------------------------------------------------

# Name/layer substrings that corroborate a geometric glazing candidate. Purely
# a confidence signal — geometry alone is enough to qualify.
GLAZING_NAME_HINTS = ("glass", "glaz", "igu", "vitr", "window", "curtain",
                      "gl-", "gl_", "vision", "spandrel")


def find_glazing(max_faces=2000, min_pane_mm=200.0, plane_tol_mm=1.0,
                 max_thickness_mm=60.0, axial_gap_mm=150.0,
                 lateral_factor=0.35, select=True):
    """Scan the whole scene for glazing candidates and select them for review.

    The 95% case: the architects delivered the facade already modeled per-lite
    and nobody wants to hand-pick thousands of IGUs. Every object passing the
    geometric lite test qualifies (thin solid, two large opposite faces, wide
    in both in-plane directions — mullion profiles fail the width test); name
    and layer hints only raise confidence, and multi-lite stacks raise it
    further. Nothing is modified — review the resulting selection in the
    viewport, deselect any false positives, then run tag().
    """
    if rt is None:
        print("Run inside 3ds Max.")
        return []
    plane_tol = _mm(plane_tol_mm)
    max_thickness = _mm(max_thickness_mm)
    min_pane = _mm(min_pane_mm)

    def hinted(obj):
        name = str(obj.name).lower()
        layer = ""
        try:
            layer = str(obj.layer.name).lower()
        except Exception:  # noqa: BLE001
            pass
        return any(h in name or h in layer for h in GLAZING_NAME_HINTS)

    # Every geometry node is probed via a world-space snapshot, whatever its
    # class — imports (Body Objects, linked geometry, live modifier stacks)
    # qualify without being touched. Nothing is skipped silently: rejections
    # are counted by reason, and rejects that LOOK like glazing by name are
    # called out individually, because those are the ones worth questioning.
    candidates, reasons, hinted_rejects, scanned = [], {}, [], 0
    for obj in rt.geometry:
        scanned += 1
        rec, why = _probe_lite(obj, plane_tol, max_thickness, max_faces)
        if rec is not None and rec["extent_min"] < min_pane:
            rec, why = None, "narrower than %.0fmm in-plane (frame profile?)" % min_pane_mm
        if rec is None:
            reasons[why] = reasons.get(why, 0) + 1
            if hinted(obj):
                hinted_rejects.append((str(obj.name), why))
            continue
        rec["hinted"] = hinted(obj)
        candidates.append(rec)

    groups = _group_igus(candidates, _mm(axial_gap_mm), lateral_factor)
    multi = sum(1 for g in groups if len(g) > 1)
    in_multi = {id(r["obj"]) for g in groups if len(g) > 1 for r in g}
    # Low confidence = geometry is the only evidence: no name hint AND not
    # part of a multi-lite stack. Worth a second look before tagging.
    low = [r["obj"].name for r in candidates
           if not r["hinted"] and id(r["obj"]) not in in_multi]

    objs = [r["obj"] for r in candidates]
    if select and objs:
        rt.select(objs)
    print("g2m: %d glazing candidates in %d IGU groups (%d multi-lite), of %d objects scanned%s."
          % (len(objs), len(groups), multi, scanned,
             "; selected for review" if select and objs else ""))
    if low:
        shown = ", ".join(low[:12]) + (" ..." if len(low) > 12 else "")
        print("  low confidence (geometry only, single lite): %s" % shown)
    if hinted_rejects:
        print("  NAMED like glazing but rejected:")
        for name, why in hinted_rejects[:8]:
            print("    %s: %s" % (name, why))
        if len(hinted_rejects) > 8:
            print("    ... and %d more" % (len(hinted_rejects) - 8))
    if not objs and reasons:
        top = sorted(reasons.items(), key=lambda kv: kv[1], reverse=True)
        print("  Nothing qualified. Rejections by reason:")
        for why, n in top[:5]:
            print("    %4d x %s" % (n, why))
        print("  If your glazing is single planes (no thickness), the solid-lite"
              " pipeline cannot tag it; use the Planar geometry export instead.")
    if objs:
        print("  Review the selection, deselect false positives, then tag.")
    return objs


def assign_type(prefix):
    """Stamp a glass2mdl export prefix on the current selection.

    The alternative to bind()'s name/layer pattern map, for models whose
    naming doesn't identify the glazing type: select all IGUs of one type
    (however you find them), assign, repeat per type. bind() reads this stamp
    first and falls back to its pattern map."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    sel = list(rt.selection)
    for obj in sel:
        rt.setUserProp(obj, PROP_TYPE, prefix)
    print("g2m: type '%s' assigned to %d objects." % (prefix, len(sel)))


def tag(pattern=None, convert=True, plane_tol_mm=1.0, max_thickness_mm=60.0,
        axial_gap_mm=150.0, lateral_factor=0.35):
    """Tag lites in the selection (or matching a name/layer pattern) with the
    ID 1/2/3 convention, and group them into IGUs stored as user properties.

    Face IDs live on Editable Poly/Mesh, so anything else in the selection is
    collapsed first (convert=True, the default; undoable). Pass convert=False
    to leave import classes and modifier stacks untouched and skip them.
    """
    if rt is None:
        print("Run inside 3ds Max.")
        return
    objs = _candidates(pattern)
    if not objs:
        print("Nothing to tag — select objects or pass a pattern like '*glass*'.")
        return

    plane_tol = _mm(plane_tol_mm)
    max_thickness = _mm(max_thickness_mm)
    axial_gap = _mm(axial_gap_mm)

    records, skipped, converted = [], [], 0
    with _UndoBlock():
        for obj in objs:
            if convert and rt.classOf(obj) not in (rt.Editable_Poly, rt.Editable_mesh):
                try:
                    rt.convertToPoly(obj)
                    converted += 1
                except Exception:  # noqa: BLE001
                    pass
            rec, why = _analyze_lite(obj, plane_tol, max_thickness)
            if rec is None:
                skipped.append((obj.name, why))
            else:
                records.append(rec)

        groups = _pick_exterior(_group_igus(records, axial_gap, lateral_factor))

        for igu_idx, group in enumerate(groups):
            group.sort(key=lambda r: _dot(r["center"], r["ext_axis"]), reverse=True)
            names = lite_position_names(len(group))
            for rec, position in zip(group, names):
                ext = rec["ext_axis"]
                if _dot(rec["side_a"]["n"], ext) > 0:
                    ext_faces, int_faces = rec["side_a"]["faces"], rec["side_b"]["faces"]
                else:
                    ext_faces, int_faces = rec["side_b"]["faces"], rec["side_a"]["faces"]
                _set_face_ids(rec, [(ext_faces, ID_EXTERIOR),
                                    (int_faces, ID_INTERIOR),
                                    (rec["edges"], ID_EDGE)])
                obj = rec["obj"]
                rt.setUserProp(obj, PROP_TAGGED, "1")
                rt.setUserProp(obj, PROP_IGU, str(igu_idx))
                rt.setUserProp(obj, PROP_POSITION, position)

    print("g2m: tagged %d lites in %d IGUs; skipped %d%s."
          % (len(records), len(groups), len(skipped),
             "; collapsed %d to Editable Poly (undoable)" % converted if converted else ""))
    for name, why in skipped:
        print("  skipped %s: %s" % (name, why))


class _UndoBlock:
    """Bulk face edits inside one undo record keeps Max responsive."""

    def __enter__(self):
        try:
            rt.execute("theHold.Begin()")
        except Exception:  # noqa: BLE001
            pass
        return self

    def __exit__(self, *exc):
        try:
            rt.execute('theHold.Accept "glass2mdl"')
        except Exception:  # noqa: BLE001
            pass
        return False


def _diag_material(name, rgb):
    try:
        m = rt.PhysicalMaterial()
        m.base_color = rt.Color(rgb[0], rgb[1], rgb[2])
    except Exception:  # noqa: BLE001
        m = rt.StandardMaterial()
        m.diffuse = rt.Color(rgb[0], rgb[1], rgb[2])
    m.name = name
    return m


def qa():
    """Assign the red/blue/green diagnostic Multi-Sub to every tagged lite.
    Orbit the model: exterior must read red everywhere."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    mm = rt.MultiMaterial(numsubs=3)
    mm.name = "g2m_QA"
    for mat_id, (label, rgb) in QA_COLORS.items():
        mm.materialList[mat_id - 1] = _diag_material("g2m_QA_%s" % label, rgb)
        mm.names[mat_id - 1] = label
    tagged = _tagged_objects()
    for obj in tagged:
        obj.material = mm
    print("g2m: QA material on %d objects. Red out, blue in, green edges."
          % len(tagged))


def _flip_igu(members):
    """Swap exterior/interior on every lite of one IGU, and reverse the lite
    positions (outer becomes inner) so bind() stays consistent."""
    positions = [str(rt.getUserProp(o, PROP_POSITION)) for o in members]
    for obj, new_pos in zip(members, reversed(positions)):
        kind = "poly" if rt.classOf(obj) == rt.Editable_Poly else "mesh"
        if kind == "poly":
            nf = int(rt.polyop.getNumFaces(obj))
            ones = [f for f in range(1, nf + 1)
                    if int(rt.polyop.getFaceMatID(obj, f)) == ID_EXTERIOR]
            twos = [f for f in range(1, nf + 1)
                    if int(rt.polyop.getFaceMatID(obj, f)) == ID_INTERIOR]
            _set_face_ids({"obj": obj, "kind": kind},
                          [(ones, ID_INTERIOR), (twos, ID_EXTERIOR)])
        else:
            m = obj.mesh
            nf = int(m.numfaces)
            ones = [f for f in range(1, nf + 1)
                    if int(rt.getFaceMatID(m, f)) == ID_EXTERIOR]
            twos = [f for f in range(1, nf + 1)
                    if int(rt.getFaceMatID(m, f)) == ID_INTERIOR]
            for f in ones:
                rt.setFaceMatID(m, f, ID_INTERIOR)
            for f in twos:
                rt.setFaceMatID(m, f, ID_EXTERIOR)
            obj.mesh = m
            rt.update(obj)
        rt.setUserProp(obj, PROP_POSITION, new_pos)


def _igus_of(objects):
    igus = {}
    for obj in objects:
        igu = rt.getUserProp(obj, PROP_IGU)
        if igu is not None:
            igus.setdefault(str(igu), None)
    members = {k: [] for k in igus}
    for obj in _tagged_objects():
        key = str(rt.getUserProp(obj, PROP_IGU))
        if key in members:
            members[key].append(obj)
    return members


def flip_selected():
    """Flip every IGU touched by the current selection (whole IGUs flip
    together — a wrong exterior guess is wrong for all its lites)."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    members = _igus_of(list(rt.selection))
    for key, objs in members.items():
        _flip_igu(objs)
    print("g2m: flipped %d IGU(s)." % len(members))


def flip_all():
    if rt is None:
        print("Run inside 3ds Max.")
        return
    members = _igus_of(_tagged_objects())
    for objs in members.values():
        _flip_igu(objs)
    print("g2m: flipped all %d IGU(s)." % len(members))


# --- Automatic Iray+ MDL material creation -------------------------------
# Proven 2026-08-25 by scripts/max/discover_iray_mdl_api.py (creation
# round-trip): a fresh Iray+ material loads a custom module by its
# fully-qualified type name, and its parameters are set through the Iray+ irp*
# API. Same path the in-house Iray-Mapper uses (create_iray_material /
# safe_irp_set).


def create_iray_mdl_material(type_name, params=None, enable_emission=False, name=None):
    """Create one Iray+ material backed by a custom MDL module.

    type_name: the fully-qualified Iray+ type, e.g.
        "mdl::validation_kit::agc_v5227_dgu_solid_reference::"
        "agc_v5227_dgu_solid(float,float,float,float,bool)"
    params: {mdl_param_name: value}, e.g. {"visible_transmittance": 0.53,
        "interior_face": True}. Keys are the MDL parameter names (the suffix
        after the type), not the full irp key.
    Returns the material, or None if the Iray+ API is unavailable or the type
    is rejected.
    """
    if rt is None:
        print("Run inside 3ds Max.")
        return None
    if not hasattr(rt, "irpSetMaterialType"):
        print("g2m: Iray+ MDL API not available (irpSetMaterialType missing).")
        return None
    try:
        mat = rt.Iray__Material()
    except Exception as exc:  # noqa: BLE001
        print("g2m: Iray__Material() failed: %s" % exc)
        return None
    try:
        rt.irpSetMaterialType(mat, type_name, enable_emission)
    except Exception as exc:  # noqa: BLE001
        print("g2m: irpSetMaterialType failed for %s: %s" % (type_name, exc))
        return None
    if name:
        try:
            mat.name = name
        except Exception:  # noqa: BLE001
            pass
    if params:
        if _set_irp_params(mat, type_name, params) == 0:
            # Every parameter missing means the renderer never loaded the
            # module: the material would render as the pink/grey fallback.
            # Refuse it and say exactly where the file has to live.
            seg = type_name.split("::")
            folder = seg[1] if len(seg) > 3 else "<export folder>"
            module = seg[2] if len(seg) > 3 else "<module>"
            print("g2m: MODULE NOT RESOLVED: %s" % type_name)
            print("     None of its parameters exist on the created material, so")
            print("     Iray could not load %s.mdl from disk." % module)
            print("     Fix: the exported folder '%s' must sit DIRECTLY" % folder)
            print("     under a folder listed in Iray+ settings > MDL search")
            print("     paths (the folder's parent on disk IS the search path).")
            print("     Move it there, then Bind again.")
            return None
    return mat


def _set_irp_params(mat, type_name, params):
    """Set MDL params via the irp* API, guarded against the live property list.
    The full key is `<type_name>_<param>`; fall back to a unique suffix match if
    the stored type string differs in signature formatting. Returns how many
    parameters were actually set."""
    try:
        plist = [str(p) for p in rt.irpGetPropertyList(mat)]
    except Exception:  # noqa: BLE001
        plist = []
    known = set(plist)
    set_count = 0
    for pname, val in params.items():
        key = type_name + "_" + pname
        if key not in known:
            suffix = "_" + pname
            matches = [p for p in plist if p.endswith(suffix)]
            key = matches[0] if len(matches) == 1 else None
        if key is None:
            print("g2m: no Iray+ property for MDL param '%s' (skipped)." % pname)
            continue
        try:
            rt.irpSetProperty(mat, key, val)
            set_count += 1
        except Exception as exc:  # noqa: BLE001
            print("g2m: irpSetProperty failed for '%s': %s" % (key, exc))
    return set_count


def load_manifest(path):
    """Read a bind_manifest.json from a glass2mdl volumetric export.

    Returns the factory-shaped mapping for make_iray_mdl_factory. Accepts both
    the shipped envelope ({"format": ..., "types": {...}}) and a bare mapping.

        ga.bind({"*gl-01*": "v5227_dgu"},
                material_factory=ga.make_iray_mdl_factory(
                    ga.load_manifest(r"C:\\path\\to\\bind_manifest.json")))
    """
    import json
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("types", data)


def make_iray_mdl_factory(manifest):
    """Build a bind() material_factory from a manifest.

    manifest: {export_prefix: {
        "type_name": <fully-qualified Iray+ MDL type>,
        "params": {param: value, ...},               # shared across faces
        "slot_params": {"exterior": {...}, "interior": {...}, "edge": {...}},
        "enable_emission": False,                     # optional
    }}

    The returned factory(prefix, position, slot) creates one Iray+ material per
    face, merging the shared params with the per-slot override (e.g.
    interior_face True on the interior face, False on the exterior).

    A spec may instead nest per-lite specs under "by_position" keyed by lite
    position ("outer"/"inner"/...), so a DGU can give its outer and inner lites
    different materials. "_default" catches any unlisted position.
    """
    def factory(prefix, position, slot):
        spec = manifest.get(prefix)
        if spec is None:
            return None
        by_pos = spec.get("by_position")
        if by_pos is not None:
            spec = by_pos.get(position) or by_pos.get("_default")
            if spec is None:
                return None
        params = dict(spec.get("params", {}))
        params.update(spec.get("slot_params", {}).get(slot, {}))
        return create_iray_mdl_material(
            spec["type_name"],
            params,
            enable_emission=bool(spec.get("enable_emission", False)),
            name="g2m_%s_%s_%s" % (prefix, position, slot),
        )
    return factory


# Example manifest for the render-validated V5227 DGU solid (VLT 0.529 vs 0.53).
# The real manifest will ship in the glass2mdl export; this proves the path and
# lets bind() run fully automatic against the already-deployed module today.
EXAMPLE_MANIFEST = {
    "v5227_dgu": {
        "type_name": (
            "mdl::validation_kit::agc_v5227_dgu_solid_reference::"
            "agc_v5227_dgu_solid(float,float,float,float,bool)"
        ),
        "params": {
            "visible_transmittance": 0.53,
            "rvis_exterior": 0.17,
            "rvis_interior": 0.13,
            "lite_thickness_mm": 24.0,
        },
        "slot_params": {
            "exterior": {"interior_face": False},
            "interior": {"interior_face": True},
            "edge": {"interior_face": False},
        },
        "enable_emission": False,
    },
}


# ACCURATE per-lite V5227 DGU: distinct outer (coated) and inner (clear) lites,
# fitted so the two-lite assembly reproduces the datasheet (Tvis 0.53 / Rf 0.17 /
# Rb 0.13). Requires mdl/templates/g2m_v5227_dgu.mdl deployed under
# %USERPROFILE%\Documents\mdl\validation_kit\. Use on a DOUBLE-lite scene so the
# outer/inner positions resolve.
V5227_DGU_MANIFEST = {
    "v5227_dgu": {
        "by_position": {
            "outer": {
                "type_name": (
                    "mdl::validation_kit::g2m_v5227_dgu::"
                    "g2m_v5227_dgu_outer(float,float,float,float,bool)"
                ),
                "params": {
                    "visible_transmittance": 0.5746,
                    "rvis_exterior": 0.1429,
                    "rvis_interior": 0.0571,
                    "lite_thickness_mm": 6.0,
                },
                "slot_params": {
                    "exterior": {"interior_face": False},
                    "interior": {"interior_face": True},
                    "edge": {"interior_face": False},
                },
            },
            "inner": {
                "type_name": (
                    "mdl::validation_kit::g2m_v5227_dgu::"
                    "g2m_v5227_dgu_inner(float)"
                ),
                "params": {"ior": 1.52},
            },
        },
    },
}


def bind(type_map=None, material_factory=None):
    """Build one Multi-Sub per (glazing type, lite position) and assign it.

    The glazing type of each lite resolves in order:
      1. the `g2m_type` stamp from assign_type() (selection-based typing), then
      2. type_map: {name_or_layer_fnmatch_pattern: glass2mdl_export_prefix},
         e.g. {"*curtain*": "v5227_dgu"} — the option for models whose names
         or layers identify the type.
    Either alone is enough; lites resolving to no type are left untouched and
    counted as unmatched.

    material_factory(prefix, position, slot) -> material or None, where slot
    is one of "exterior"/"interior"/"edge". The Iray+ MDL discovery run
    (scripts/max/discover_iray_mdl_api.py) PASSED 2026-08-25, so automatic
    creation is available: pass
    material_factory=make_iray_mdl_factory(manifest) (see EXAMPLE_MANIFEST).
    Leave it None to keep the one-drag-per-type fallback: slots stay empty and
    each is a single drag from the material browser, once per type not per IGU.
    """
    if rt is None:
        print("Run inside 3ds Max.")
        return
    multis = {}
    bound = unmatched = 0
    for obj in _tagged_objects():
        stamped = rt.getUserProp(obj, PROP_TYPE)
        prefix = str(stamped) if stamped not in (None, "", "undefined") else None
        if prefix is None and type_map:
            name = str(obj.name).lower()
            layer = ""
            try:
                layer = str(obj.layer.name).lower()
            except Exception:  # noqa: BLE001
                pass
            for pattern, pfx in type_map.items():
                if fnmatch.fnmatch(name, pattern.lower()) or fnmatch.fnmatch(layer, pattern.lower()):
                    prefix = pfx
                    break
        if prefix is None:
            unmatched += 1
            continue
        position = str(rt.getUserProp(obj, PROP_POSITION))
        key = (prefix, position)
        if key not in multis:
            mm = rt.MultiMaterial(numsubs=3)
            mm.name = "g2m_%s_%s" % (prefix, position)
            for i, slot in enumerate(("exterior", "interior", "edge")):
                mm.names[i] = "%s face (ID%d)" % (slot, i + 1)
                mat = material_factory(prefix, position, slot) if material_factory else None
                mm.materialList[i] = mat
            multis[key] = mm
        obj.material = multis[key]
        bound += 1
    print("g2m: bound %d objects to %d Multi-Sub materials; %d unmatched."
          % (bound, len(multis), unmatched))
    if material_factory is None and multis:
        print("Slots are empty by design — drag the glass2mdl materials from")
        print("the browser into each Multi-Sub once (per type, not per IGU):")
        for (prefix, position), mm in sorted(multis.items()):
            print("  %s  <- module material '%s_%s' (per-face names arrive "
                  "with the coated-solid emitter)" % (mm.name, prefix, position))


def report():
    """What is tagged, grouped how, typed as what."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    tagged = _tagged_objects()
    igus = {}
    types = {}
    for obj in tagged:
        igus.setdefault(str(rt.getUserProp(obj, PROP_IGU)), []).append(
            (str(obj.name), str(rt.getUserProp(obj, PROP_POSITION))))
        t = rt.getUserProp(obj, PROP_TYPE)
        key = str(t) if t is not None else "(untyped)"
        types[key] = types.get(key, 0) + 1
    print("g2m: %d tagged lites in %d IGUs." % (len(tagged), len(igus)))
    for t, n in sorted(types.items()):
        print("  type %s: %d lites" % (t, n))
    for key in sorted(igus, key=lambda k: int(k) if k.isdigit() else 0):
        listing = ", ".join("%s(%s)" % pair for pair in igus[key])
        print("  IGU %s: %s" % (key, listing))


def clear_tags():
    """Reset every g2m stamp — including the product type, which otherwise
    survives in the scene and can bleed into the next product's bind."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    n = 0
    for obj in _tagged_objects():
        rt.setUserProp(obj, PROP_TAGGED, "0")
        rt.setUserProp(obj, PROP_TYPE, "")
        n += 1
    print("g2m: cleared %d tags (types included)." % n)


def build_test_scene():
    """Three double-lite IGUs plus one rotated copy, for a dry run of
    tag() -> qa() -> flip_selected() -> bind() before touching a real model."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    lite_w, lite_h, lite_t, gap = _mm(1500), _mm(1000), _mm(6), _mm(12)
    made = []
    for i in range(4):
        for j, side in enumerate(("outer", "inner")):
            box = rt.Box(width=lite_w, length=lite_t, height=lite_h)
            box.name = "g2m_test_igu%d_glass_%s" % (i, side)
            box.position = rt.Point3(i * _mm(2500), -j * (lite_t + gap), 0.0)
            rt.convertToPoly(box)
            made.append(box)
        if i == 3:
            for box in made[-2:]:
                rt.rotate(box, rt.eulerangles(0, 0, 90))
    rt.select(made)
    print("g2m: built %d test lites (IGU 3 is rotated 90 degrees). Now: tag()"
          % len(made))


def check_selection(max_faces=2000, min_pane_mm=200.0, plane_tol_mm=1.0,
                    max_thickness_mm=60.0):
    """Probe the current selection: which objects can be tagged as lites, and
    why not otherwise. Touches nothing — this is the pre-flight for tag()."""
    if rt is None:
        print("Run inside 3ds Max.")
        return []
    sel = list(rt.selection)
    if not sel:
        print("g2m: nothing selected. Select your glazing solids first — each"
              " lite as its own object.")
        return []
    plane_tol = _mm(plane_tol_mm)
    max_thickness = _mm(max_thickness_mm)
    min_pane = _mm(min_pane_mm)
    ok, bad = [], []
    for obj in sel:
        rec, why = _probe_lite(obj, plane_tol, max_thickness, max_faces)
        if rec is not None and rec["extent_min"] < min_pane:
            rec, why = None, ("narrower than %.0fmm in-plane (frame profile?)"
                              % min_pane_mm)
        if rec is None:
            bad.append((str(obj.name), why))
        else:
            ok.append(obj)
    print("g2m: %d of %d selected objects look like lites." % (len(ok), len(sel)))
    for name, why in bad[:15]:
        print("  not a lite — %s: %s" % (name, why))
    if len(bad) > 15:
        print("  ... and %d more" % (len(bad) - 15))
    if ok and not bad:
        print("  All good. Next: Tag + color check.")
    elif ok:
        print("  You can Tag now; the objects above will be skipped.")
    return ok


def probe_manifest(manifest):
    """Create one throwaway material from the manifest to prove the .mdl
    actually resolves from disk, BEFORE anything is bound. The unresolved
    case prints the placement fix (see create_iray_mdl_material)."""
    if rt is None:
        print("Run inside 3ds Max.")
        return False
    spec = None
    for entry in manifest.values():
        specs = list(entry.get("by_position", {}).values()) or [entry]
        for s in specs:
            if isinstance(s, dict) and "type_name" in s:
                spec = s
                break
        if spec:
            break
    if spec is None:
        print("g2m: manifest has no usable material spec.")
        return False
    mat = create_iray_mdl_material(spec["type_name"], dict(spec.get("params", {})),
                                   name="g2m_probe")
    if mat is not None:
        print("g2m: module resolves — ready to Bind.")
        return True
    return False


# --- GUI -------------------------------------------------------------------
# Running this file from Scripting > Run Script opens this window: the whole
# pipeline as buttons in workflow order, with every report echoed into the
# window's log (and still printed to the listener).

_GUI = None  # keeps the dialog alive; Max's Python GC closes unparented Qt


def show_gui():
    global _GUI
    if rt is None:
        print("Run inside 3ds Max.")
        return
    try:
        from PySide2 import QtWidgets, QtGui  # Max 2021-2024
    except ImportError:
        try:
            from PySide6 import QtWidgets, QtGui  # Max 2025+
        except ImportError:
            print("g2m: PySide not available; drive the listener API instead "
                  "(find_glazing / tag / qa / bind).")
            return

    parent = None
    try:
        import qtmax
        parent = qtmax.GetQMaxMainWindow()
    except Exception:  # noqa: BLE001
        pass

    if _GUI is not None:
        try:
            _GUI.close()
        except Exception:  # noqa: BLE001
            pass

    dlg = QtWidgets.QDialog(parent)
    dlg.setWindowTitle("glass2mdl - apply to modeled IGUs")
    dlg.setMinimumWidth(480)
    root = QtWidgets.QVBoxLayout(dlg)

    log = QtWidgets.QPlainTextEdit()
    log.setReadOnly(True)
    log.setMinimumHeight(170)
    log.setFont(QtGui.QFont("Consolas", 9))

    state = {"manifest": None}

    def run(fn, redraw=True):
        """Run one step; everything it prints lands in the log AND listener."""
        import contextlib
        import io
        import traceback
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                fn()
        except Exception:  # noqa: BLE001
            buf.write(traceback.format_exc())
        text = buf.getvalue().rstrip()
        if text:
            log.appendPlainText(text)
            print(text)
        if redraw:
            try:
                rt.redrawViews()
            except Exception:  # noqa: BLE001
                pass

    def group(title, tip=None):
        box = QtWidgets.QGroupBox(title)
        lay = QtWidgets.QVBoxLayout(box)
        if tip:
            lbl = QtWidgets.QLabel(tip)
            lbl.setWordWrap(True)
            lbl.setStyleSheet("color: gray;")
            lay.addWidget(lbl)
        root.addWidget(box)
        return lay

    # 1 - Select
    lay1 = group("1 · Select the glazing",
                 "In the viewport, select the glazing solids you want to "
                 "convert — each lite as its own object — then check them "
                 "here. Nothing is modified by the check.")
    row1 = QtWidgets.QHBoxLayout()
    btn_check = QtWidgets.QPushButton("Check my selection")
    btn_scan = QtWidgets.QPushButton("Find candidates for me")
    btn_test = QtWidgets.QPushButton("Build test scene")
    row1.addWidget(btn_check)
    row1.addWidget(btn_scan)
    row1.addWidget(btn_test)
    row1.addStretch(1)
    lay1.addLayout(row1)
    btn_check.clicked.connect(lambda: run(check_selection, redraw=False))
    btn_scan.clicked.connect(lambda: run(find_glazing))
    btn_test.clicked.connect(lambda: run(build_test_scene))

    # 2 - Tag + check
    lay2 = group("2 · Tag faces + color check",
                 "Assigns face IDs on the selection (1 exterior / 2 interior / "
                 "3 edges) and paints the check colors. Orbit the model: "
                 "exterior glass must read RED. Blue outside? Select it and "
                 "flip.")
    chk_convert = QtWidgets.QCheckBox(
        "Collapse to Editable Poly when needed (undoable; required for face IDs)")
    chk_convert.setChecked(True)
    lay2.addWidget(chk_convert)
    row2 = QtWidgets.QHBoxLayout()
    btn_tag = QtWidgets.QPushButton("Tag + color check")
    btn_flip = QtWidgets.QPushButton("Flip selected")
    btn_flip_all = QtWidgets.QPushButton("Flip all")
    row2.addWidget(btn_tag)
    row2.addWidget(btn_flip)
    row2.addWidget(btn_flip_all)
    row2.addStretch(1)
    lay2.addLayout(row2)

    def do_tag():
        tag(convert=chk_convert.isChecked())
        qa()
    btn_tag.clicked.connect(lambda: run(do_tag))
    btn_flip.clicked.connect(lambda: run(flip_selected))
    btn_flip_all.clicked.connect(lambda: run(flip_all))

    # 3 - Bind
    lay3 = group("3 · Bind the real materials",
                 "Point at the bind_manifest.json inside the downloaded, "
                 "unzipped export folder. The export folder must sit DIRECTLY "
                 "under a folder listed in Iray+ settings > MDL search paths — "
                 "choosing the manifest checks this for you before anything "
                 "is bound.")
    row3a = QtWidgets.QHBoxLayout()
    btn_manifest = QtWidgets.QPushButton("Choose bind_manifest.json...")
    lbl_manifest = QtWidgets.QLabel("no manifest loaded")
    lbl_manifest.setStyleSheet("color: gray;")
    row3a.addWidget(btn_manifest)
    row3a.addWidget(lbl_manifest, 1)
    lay3.addLayout(row3a)
    lbl_multi = QtWidgets.QLabel(
        "This manifest carries several glazing types: select each type's "
        "lites in the viewport and mark them, then Bind.")
    lbl_multi.setWordWrap(True)
    lbl_multi.setStyleSheet("color: gray;")
    lbl_multi.hide()
    lay3.addWidget(lbl_multi)
    row3b = QtWidgets.QHBoxLayout()
    combo_type = QtWidgets.QComboBox()
    combo_type.setMinimumWidth(180)
    btn_stamp = QtWidgets.QPushButton("Mark selection as this type")
    btn_bind = QtWidgets.QPushButton("Bind materials")
    combo_type.hide()
    btn_stamp.hide()
    row3b.addWidget(combo_type)
    row3b.addWidget(btn_stamp)
    row3b.addWidget(btn_bind)
    row3b.addStretch(1)
    lay3.addLayout(row3b)

    def choose_manifest():
        path, _filter = QtWidgets.QFileDialog.getOpenFileName(
            dlg, "Choose bind_manifest.json", "", "bind manifest (*.json)")
        if not path:
            return
        def load():
            import os
            state["manifest"] = load_manifest(path)
            keys = sorted(state["manifest"].keys())
            combo_type.clear()
            combo_type.addItems(keys)
            multi = len(keys) > 1
            combo_type.setVisible(multi)
            btn_stamp.setVisible(multi)
            lbl_multi.setVisible(multi)
            lbl_manifest.setText(path)
            export_dir = os.path.dirname(os.path.abspath(path))
            print("g2m: manifest loaded; %d glazing type(s): %s"
                  % (len(keys), ", ".join(keys)))
            if not multi:
                print("  One type only — Bind applies it to everything tagged.")
            print("  Export folder: %s" % export_dir)
            print("  Its parent must be an Iray+ MDL search path: %s"
                  % os.path.dirname(export_dir))
            probe_manifest(state["manifest"])
        run(load, redraw=False)
    btn_manifest.clicked.connect(choose_manifest)

    btn_stamp.clicked.connect(
        lambda: run(lambda: assign_type(combo_type.currentText()), redraw=False))

    def do_bind():
        manifest = state["manifest"]
        if not manifest:
            print("g2m: choose the bind_manifest.json first.")
            return
        keys = set(manifest)

        def current_type(obj):
            cur = rt.getUserProp(obj, PROP_TYPE)
            return str(cur) if cur not in (None, "", "undefined") else None

        if len(keys) == 1:
            # One type in the manifest: Bind means "apply THIS product to
            # everything tagged". Type stamps from an earlier product are
            # stale state, not intent — overwrite them, and say so.
            only = next(iter(keys))
            stamped = restamped = 0
            for obj in _tagged_objects():
                cur = current_type(obj)
                if cur == only:
                    continue
                rt.setUserProp(obj, PROP_TYPE, only)
                if cur is None:
                    stamped += 1
                else:
                    restamped += 1
            if stamped:
                print("g2m: stamped %d untyped lites as '%s'." % (stamped, only))
            if restamped:
                print("g2m: re-stamped %d lites from an earlier product to '%s'."
                      % (restamped, only))
        else:
            # Several types: stamps are meaningful, but a stamp this manifest
            # doesn't know would bind nothing — say which and how to fix it.
            strays = {}
            for obj in _tagged_objects():
                cur = current_type(obj)
                if cur is not None and cur not in keys:
                    strays[cur] = strays.get(cur, 0) + 1
            for t, n in sorted(strays.items()):
                print("g2m: %d lites are typed '%s', which this manifest does"
                      " not offer — left alone. Select them and Mark as one"
                      " of: %s" % (n, t, ", ".join(sorted(keys))))
        bind(material_factory=make_iray_mdl_factory(manifest))
    btn_bind.clicked.connect(lambda: run(do_bind))

    # Extras + log
    row4 = QtWidgets.QHBoxLayout()
    btn_report = QtWidgets.QPushButton("Report")
    btn_clear = QtWidgets.QPushButton("Clear tags")
    row4.addWidget(btn_report)
    row4.addWidget(btn_clear)
    row4.addStretch(1)
    root.addLayout(row4)
    btn_report.clicked.connect(lambda: run(report, redraw=False))
    btn_clear.clicked.connect(lambda: run(clear_tags))

    root.addWidget(log)

    dlg.show()
    _GUI = dlg
    log.appendPlainText(
        "Workflow: select your glazing in the viewport > Check > Tag + color "
        "check > flip anything blue-out > choose the manifest > Bind.\n"
        "No Material ID setup is needed beforehand; tagging does it.")
    print("g2m: window open. If you closed it, run this script again.")


if __name__ == "__main__":
    show_gui()
