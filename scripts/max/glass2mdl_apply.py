"""glass2mdl — apply per-face Material IDs and materials to modeled IGUs.

3ds Max 2024, Python/pymxs. Work scales with glazing TYPES, not IGU count:
face tagging is geometric, QA is one visual pass, material creation happens
once per (type, lite position).

Face ID convention (extends validation-kit test 03):
    ID 1 = exterior large face
    ID 2 = interior large face
    ID 3 = edge faces

Scripting > Run Script on this file OPENS A WINDOW that walks the pipeline:
select the glazing > Tag + color check > flip anything backwards > choose the
exported bind_manifest.json > Assign materials. That is the normal path; no
listener needed.

The same pipeline is scriptable from the listener:

    import glass2mdl_apply as ga
    ga.build_test_scene()        # optional: synthetic boxes to try it on
    ga.find_glazing()            # 95% case: scan an architect-delivered model,
                                 # auto-identify lite-shaped solids, select them
    #   ...review the selection in the viewport, deselect false positives...
    ga.tag()                     # tag current selection (or ga.tag("*glass*"))
    ga.qa()                      # green=exterior / red=interior / blue=edges
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
exterior must read green, flip what is wrong. Consistency matters more than the
first guess being right.

Scope: each lite is a separate solid object (Editable Poly or Editable
Mesh; pass convert=True to collapse other geometry), or a combined object
carrying several lites — a Revit "Triple-Glazed Vision" panel that arrives
as ONE mesh with three solid lites plus framing is split by tag() into
per-lite objects, framing left behind untagged. Two topologies are handled:
lites as disconnected shells inside the mesh, and lites WELDED to the
framing (Revit shares vertices at the glazing pocket, fusing everything into
one shell) — those are recovered by pairing large parallel sheet clusters
along the stack axis. debug_shells() explains either analysis per object.
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

# Green = exterior reads as "good to go" from outside, red = interior showing
# means something is flipped, blue = edges. (Jeff's request, 2026-08-27.)
QA_COLORS = {
    ID_EXTERIOR: ("exterior (ID1)", (26, 204, 51)),
    ID_INTERIOR: ("interior (ID2)", (230, 26, 26)),
    ID_EDGE: ("edges (ID3)", (26, 51, 230)),
}

PROP_TAGGED = "g2m_tagged"
PROP_IGU = "g2m_igu"
PROP_POSITION = "g2m_position"
PROP_TYPE = "g2m_type"

# A spandrel back pan is tagged without face IDs (one material on every
# face) and outside the IGU grouping; bind() resolves it through the
# manifest's `_default` position, so the name here only has to be one no
# lite ever gets.
POSITION_PAN = "pan"

# Thinnest sheet the lite tests accept, in mm. 0 = no floor (the default so
# far). A sheet-metal back pan modeled as a thin solid (1-2mm) passes the
# sheet-pairing test as a lite and turns a double-glazed spandrel into
# outer/center/inner; glass is never under 3mm, so 2.5 separates them. Set
# from the listener (ga.MIN_LITE_THICKNESS_MM = 2.5) once the field model
# says its pans are read that way — see docs/spandrel-plan.md.
MIN_LITE_THICKNESS_MM = 0.0

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


def _script_revision():
    """Short FNV-1a of this file's own bytes (the hash idiom of
    contentRevision in mdl/naming.ts), shown in the window title and log.
    Self-computed at runtime so it can never go stale — a stale script copy
    was indistinguishable from a fresh one until something broke."""
    try:
        with open(__file__, "rb") as fh:
            data = fh.read()
        h = 2166136261
        for b in data:
            h = ((h ^ b) * 16777619) & 0xFFFFFFFF
        return "%07x" % (h & 0xFFFFFFF)
    except Exception:  # noqa: BLE001
        return "unknown"


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


def _cluster_faces(loops, plane_tol, faces=None):
    """Group coplanar same-direction faces; imports triangulate, so one lite
    face arrives as many triangles that must be summed before comparing.
    faces limits the clustering to those 1-based indices (one shell of a
    combined object); None means every face."""
    face_idxs = faces if faces is not None else range(1, len(loops) + 1)
    clusters = []
    for idx0 in face_idxs:
        loop = loops[idx0 - 1]
        n, area, c = _face_geometry(loop)
        if area <= 0.0:
            continue
        d = _dot(n, c)
        placed = False
        for cl in clusters:
            if _dot(n, cl["n"]) > 0.999 and abs(_dot(cl["n"], c) - cl["d"]) < plane_tol:
                cl["faces"].append(idx0)
                cl["area"] += area
                cl["center"] = _v_add(cl["center"], _v_scale(c, area))
                cl["weight"] += area
                placed = True
                break
        if not placed:
            clusters.append({"n": n, "d": d, "faces": [idx0], "area": area,
                             "center": _v_scale(c, area), "weight": area})
    for cl in clusters:
        cl["center"] = _v_scale(cl["center"], 1.0 / cl["weight"])
    return clusters


def _cluster_extents(loops, cl):
    """In-plane extents and fill of one cluster. A lite face is a mostly
    solid sheet (fill ~1.0; a rotated rectangle bounds at worst 0.5); a
    frame cap is a hollow ring that covers little of its bounds."""
    n = cl["n"]
    u = _normalize(_v_cross(n, (0.0, 0.0, 1.0) if abs(n[2]) < 0.9
                            else (1.0, 0.0, 0.0)))
    v = _v_cross(n, u)
    us, vs = [], []
    for fi in cl["faces"]:
        for p in loops[fi - 1]:
            us.append(_dot(p, u))
            vs.append(_dot(p, v))
    extent_u = _max(us) - _min(us)
    extent_v = _max(vs) - _min(vs)
    bounds = extent_u * extent_v
    return {"u": u, "v": v,
            "extent_u": extent_u, "extent_v": extent_v,
            "extent_min": _min(extent_u, extent_v),
            "fill": cl["area"] / bounds if bounds > 0 else 0.0}


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


def _probe_lite(obj, plane_tol, max_thickness, max_faces, min_extent=0.0):
    """Class-agnostic lite test for detection (see _snapshot_loops). A
    combined multi-lite object qualifies through _analyze_stack; its record
    is one representative lite carrying rec["lites"] > 1. A stack of 2+
    outranks a single-lite pass: a combined panel's equal-area faces can tie
    so that two opposite ones sort as 'largest' and the whole panel
    false-passes as one thin lite (see _split_stack)."""
    loops, why = _snapshot_loops(obj, max_faces)
    if loops is None:
        return None, why
    rec, why = _analyze_loops(loops, plane_tol, max_thickness)
    stack = _analyze_stack(loops, plane_tol, max_thickness, min_extent)
    if stack is not None and (rec is None or len(stack["lites"]) >= 2):
        rec = stack["lites"][0]
        rec["lites"] = len(stack["lites"])
    elif rec is None:
        shells = len(_elements(loops, plane_tol))
        if shells > 1:
            why += (" (%d separate shells; none passes the lite test"
                    " alone)" % shells)
        return None, why
    rec["obj"] = obj
    rec.setdefault("lites", 1)
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


def _analyze_loops(loops, plane_tol, max_thickness, faces=None):
    clusters = _cluster_faces(loops, plane_tol, faces)
    if len(clusters) < 3:
        return None, "fewer than 3 planar face groups (not a solid lite)"
    clusters.sort(key=lambda c: c["area"], reverse=True)
    a, b = clusters[0], clusters[1]
    if _dot(a["n"], b["n"]) > -0.98:
        return None, "two largest face groups are not opposite"
    if b["area"] < 0.5 * a["area"]:
        return None, "largest opposite faces differ too much in area"
    thickness = abs(_dot(a["n"], _v_sub(a["center"], b["center"])))
    if thickness > max_thickness:
        return None, "thickness %.1f exceeds the lite limit" % thickness
    if MIN_LITE_THICKNESS_MM > 0 and thickness < _mm(MIN_LITE_THICKNESS_MM):
        return None, ("thickness %.1fmm is under the %.1fmm lite minimum"
                      " (sheet metal?)" % (thickness / _mm(1.0), MIN_LITE_THICKNESS_MM))
    big = set(a["faces"]) | set(b["faces"])
    edges = [f for cl in clusters[2:] for f in cl["faces"] if f not in big]
    # In-plane extents of the big face: a lite is large in BOTH directions,
    # while a mullion/frame profile passes every test above yet is narrow in
    # one — find_glazing() rejects on this, tag() trusts the user's selection.
    # Fill catches frame caps, but only the multi-lite paths reject on it —
    # for whole objects the user's selection is trusted, as ever.
    ext = _cluster_extents(loops, a)
    return {
        "extent_min": ext["extent_min"],
        "extent_u": ext["extent_u"],
        "extent_v": ext["extent_v"],
        "fill": ext["fill"],
        "axis": a["n"],
        "center": ((a["center"][0] + b["center"][0]) / 2,
                   (a["center"][1] + b["center"][1]) / 2,
                   (a["center"][2] + b["center"][2]) / 2),
        "face_area": a["area"], "thickness": thickness,
        "side_a": {"n": a["n"], "faces": a["faces"]},
        "side_b": {"n": b["n"], "faces": b["faces"]},
        "edges": edges,
    }, None


def _elements(loops, tol):
    """Partition faces into connected shells: faces sharing a (welded)
    vertex position belong together. Position-based, not index-based,
    because imports routinely duplicate vertices per face — duplicates land
    on identical coordinates, so a quantized position key reunites them.
    The cell size stays well under any real cavity or glass-to-frame
    clearance so distinct solids never merge. Returns lists of 1-based face
    indices."""
    parent = list(range(len(loops)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    q = tol * 0.01 if tol > 0 else 1e-6
    seen = {}
    for fi, loop in enumerate(loops):
        for p in loop:
            key = (int(round(p[0] / q)), int(round(p[1] / q)), int(round(p[2] / q)))
            j = seen.get(key)
            if j is None:
                seen[key] = fi
            else:
                ra, rb = find(fi), find(j)
                if ra != rb:
                    parent[rb] = ra
    shells = {}
    for fi in range(len(loops)):
        shells.setdefault(find(fi), []).append(fi + 1)
    return list(shells.values())


def _pair_sheets(loops, plane_tol, max_thickness, min_extent, faces=None):
    """Find the lites among one face set as paired parallel SHEETS: the
    front/back of a lite are two large planar clusters facing away from
    each other, one lite thickness apart; each pair then claims its edge
    band by axial and lateral position. This works whether the set is one
    clean solid, several lites, or glass WELDED to framing — Revit shares
    vertices at the glazing pocket, fusing a whole panel into one shell
    (field-hit on a GL31X triple-glazed facade: 100 faces, 1 shell), where
    connectivity says nothing but the sheets are still there. Framing goes
    unclaimed: caps fail the fill screen, bars sit laterally outside the
    glass footprint, shims and blocks under min_extent."""
    clusters = _cluster_faces(loops, plane_tol, faces)
    if not clusters:
        return None
    ref = _max(clusters, key=lambda c: c["area"])
    axis = ref["n"]
    sheets = []
    for cl in clusters:
        if abs(_dot(cl["n"], axis)) < 0.98:
            continue
        if cl["area"] < 0.2 * ref["area"]:
            continue
        ext = _cluster_extents(loops, cl)
        if ext["fill"] < 0.35:
            continue  # hollow ring: frame cap
        if min_extent > 0 and ext["extent_min"] < min_extent:
            continue
        cl = dict(cl)
        cl.update(ext)
        cl["offset"] = _dot(axis, cl["center"])
        sheets.append(cl)
    if len(sheets) < 2:
        return None
    sheets.sort(key=lambda s: s["offset"])
    pairs, i = [], 0
    while i < len(sheets) - 1:
        a, b = sheets[i], sheets[i + 1]
        gap = b["offset"] - a["offset"]
        opposite = _dot(a["n"], b["n"]) < -0.98
        similar = _min(a["area"], b["area"]) >= 0.5 * _max(a["area"], b["area"])
        thick_enough = gap >= _mm(MIN_LITE_THICKNESS_MM) if MIN_LITE_THICKNESS_MM > 0 else True
        if opposite and similar and thick_enough and 0.0 < gap <= max_thickness:
            pairs.append((a, b))
            i += 2
        else:
            i += 1
    if not pairs:
        return None
    claimed = set()
    for a, b in pairs:
        claimed |= set(a["faces"]) | set(b["faces"])
    # Glass edge faces sit ON the pair's footprint boundary; frame bars sit
    # at least half a profile width outside it. 5mm of pad separates them.
    pad = 5.0 * plane_tol
    lites = []
    for a, b in pairs:
        u, v = a["u"], a["v"]
        us, vs = [], []
        for fi in list(a["faces"]) + list(b["faces"]):
            for p in loops[fi - 1]:
                us.append(_dot(p, u))
                vs.append(_dot(p, v))
        u0, u1 = _min(us) - pad, _max(us) + pad
        v0, v1 = _min(vs) - pad, _max(vs) + pad
        lo = a["offset"] - 2.0 * plane_tol
        hi = b["offset"] + 2.0 * plane_tol
        edges = []
        for fi in (faces if faces is not None else range(1, len(loops) + 1)):
            if fi in claimed:
                continue
            loop = loops[fi - 1]
            _n, area, c = _face_geometry(loop)
            if area <= 0.0:
                continue
            # ENTIRELY within the lite's slab: a glass edge face always is,
            # while a frame face that runs past this lite (a bar spanning
            # the whole stack, a pocket return) never is — centroid tests
            # would claim those.
            ds = [_dot(axis, p) for p in loop]
            if _min(ds) < lo or _max(ds) > hi:
                continue
            if u0 <= _dot(c, u) <= u1 and v0 <= _dot(c, v) <= v1:
                edges.append(fi)
        claimed |= set(edges)
        thickness = abs(_dot(axis, _v_sub(a["center"], b["center"])))
        center = _v_scale(_v_add(a["center"], b["center"]), 0.5)
        lites.append({
            "axis": a["n"], "center": center,
            "face_area": a["area"], "thickness": thickness,
            "extent_min": a["extent_min"], "extent_u": a["extent_u"],
            "extent_v": a["extent_v"], "fill": a["fill"],
            "side_a": {"n": a["n"], "faces": list(a["faces"])},
            "side_b": {"n": b["n"], "faces": list(b["faces"])},
            "edges": edges,
            "faces": sorted(set(a["faces"]) | set(b["faces"]) | set(edges)),
        })
    lites.sort(key=lambda r: _dot(r["center"], axis))
    return lites


def _analyze_stack(loops, plane_tol, max_thickness, min_extent):
    """The lites of a combined multi-lite object, found by sheet pairing
    within each connected shell (see _pair_sheets — one mechanism covers
    lites as separate solids in the mesh AND lites welded to framing).
    The whole-object single-lite test can never read these objects: the two
    largest face groups are usually same-direction faces of different
    lites, and equal-area faces can even tie into a false single-lite pass.

    Returns {"lites": [records, sorted along the stack axis], "shells":
    shell count, "fused": True when some shell carried 2+ lites (welded)}
    or None when the object holds no lite stack at all."""
    shells = _elements(loops, plane_tol)
    lites, fused = [], False
    for faces in shells:
        found = _pair_sheets(loops, plane_tol, max_thickness, min_extent,
                             faces=faces)
        if not found:
            continue
        lites.extend(found)
        if len(found) >= 2:
            fused = True  # several lites in ONE shell: welded to framing
    if not lites:
        return None
    axis = lites[0]["axis"]
    if any(abs(_dot(r["axis"], axis)) < 0.98 for r in lites[1:]):
        return None  # parts face different ways; not a glazing stack
    lites.sort(key=lambda r: _dot(r["center"], axis))
    return {"lites": lites, "shells": len(shells), "fused": fused}


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


def _strip_pans(groups):
    """Shadow-box spandrels: the innermost sheet of every multi-sheet stack is
    the metal back pan, not glass. Field-hit 2026-09-01 on the GL31X model:
    Revit exports the dual-glazed spandrel with its pan as one object, the
    pan is a thin solid that passes the lite test, and the stack tagged as
    outer/center/inner. Geometry alone cannot tell metal from glass, so the
    user says so (the Tag step's checkbox) and this pulls the last member off
    each group of 2+. Groups must already be sorted exterior -> interior.
    Returns (groups, pans)."""
    kept, pans = [], []
    for group in groups:
        if len(group) >= 2:
            pans.append(group[-1])
            group = group[:-1]
        kept.append(group)
    return kept, pans


def _pick_exterior(groups):
    """Orient each IGU's axis toward 'outside'. Centroid heuristic; degrades
    to a globally consistent side (for flat single facades) with a warning."""
    all_centers = [r["center"] for g in groups for r in g]
    n = len(all_centers)
    if n == 0:
        return groups
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
        print("g2m: exterior direction ambiguous (flat facade?): picked a "
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


def _is_selected(obj):
    try:
        return bool(obj.isSelected)
    except Exception:  # noqa: BLE001
        return False


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
        rec, why = _probe_lite(obj, plane_tol, max_thickness, max_faces,
                               min_extent=min_pane)
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
    multi = sum(1 for g in groups
                if len(g) > 1 or any(r.get("lites", 1) > 1 for r in g))
    in_multi = {id(r["obj"]) for g in groups if len(g) > 1 for r in g}
    in_multi |= {id(r["obj"]) for r in candidates if r.get("lites", 1) > 1}
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


def _detach_shell(obj, faces):
    """Detach one shell of an Editable Poly to its own node, keeping the
    layer and any type stamp so bind()'s resolution still works on the
    piece. Returns the new node, or None."""
    name = str(rt.uniqueName("%s_lite" % obj.name))
    try:
        rt.polyop.detachFaces(obj, faces, delete=True, asNode=True, name=name)
    except Exception as exc:  # noqa: BLE001
        print("g2m: detachFaces failed on %s: %s" % (obj.name, exc))
        return None
    node = rt.getNodeByName(name)
    if node is None:
        return None
    try:
        obj.layer.addNode(node)
    except Exception:  # noqa: BLE001
        pass
    stamp = rt.getUserProp(obj, PROP_TYPE)
    if stamp not in (None, "", "undefined"):
        rt.setUserProp(node, PROP_TYPE, str(stamp))
    return node


def _split_stack(obj, plane_tol, max_thickness, min_extent, convert,
                 min_lites=1):
    """Split a combined multi-lite object into per-lite objects so the
    per-object pipeline (IGU grouping, lite positions, per-lite materials)
    applies. Lite shells are detached to new nodes named <name>_liteNNN;
    non-lite geometry (framing) stays behind in the original, untagged.
    When the object is nothing but lites, the first stays in place instead
    so no empty node is left.

    min_lites is the caller's evidence bar: 1 when the single-lite test
    already failed (any split rescues the object), 2 when it passed — a
    combined panel's equal-area faces can tie such that two OPPOSITE ones
    sort as 'largest' and the whole panel false-passes as one lite, so a
    real multi-lite stack outranks that read, but a lone lite shell plus
    rejected junk does not.

    Returns (nodes, why): every node that may now be a single lite (detached
    pieces plus the original), or (None, reason) when the object is not a
    splittable stack. Detaching renumbers the remaining faces, so each pass
    re-analyzes and detaches ONE shell."""
    kind, loops = _world_faces(obj)
    if loops is None:
        return None, None
    stack = _analyze_stack(loops, plane_tol, max_thickness, min_extent)
    if stack is None or len(stack["lites"]) < min_lites:
        shells = len(_elements(loops, plane_tol))
        if shells > 1:
            return None, ("%d separate shells in one object; none passes the"
                          " lite test alone" % shells)
        return None, None
    count = len(stack["lites"])
    if rt.classOf(obj) != rt.Editable_Poly:
        if not convert:
            return None, ("%d stacked lites in one object; enable the"
                          " Editable Poly collapse so tagging can split"
                          " them" % count)
        try:
            rt.convertToPoly(obj)
        except Exception:  # noqa: BLE001
            return None, ("%d stacked lites in one object, but it could not"
                          " be collapsed to Editable Poly to split" % count)
    nodes = [obj]
    for _ in range(64):
        kind, loops = _world_faces(obj)
        if loops is None:
            break
        stack = _analyze_stack(loops, plane_tol, max_thickness, min_extent)
        if stack is None:
            break  # one shell left, or only non-lite geometry (framing)
        lites = stack["lites"]
        # The object is "nothing but lites" when the pairs claim every face
        # (zero-area degenerates would tip this to junk-mode and leave a
        # husk of them behind — rare, and harmless to the tagged lites).
        pure = sum(len(r["faces"]) for r in lites) == len(loops)
        if pure and len(lites) < 2:
            break  # one lite left with nothing else: it stays in the original
        rec = lites[-1] if pure else lites[0]
        node = _detach_shell(obj, rec["faces"])
        if node is None:
            return None, "could not detach a lite from the combined object"
        nodes.append(node)
    return nodes, None


def tag(pattern=None, convert=True, plane_tol_mm=1.0, max_thickness_mm=60.0,
        axial_gap_mm=150.0, lateral_factor=0.35, min_pane_mm=200.0,
        pan_behind=False):
    """Tag lites in the selection (or matching a name/layer pattern) with the
    ID 1/2/3 convention, and group them into IGUs stored as user properties.

    pan_behind=True is for shadow-box spandrels: the innermost sheet of each
    stack of 2+ is the metal back pan and is tagged as a pan (no face IDs,
    no lite position) instead of a lite, so a dual-glazed spandrel with its
    pan comes out outer/inner + pan rather than outer/center/inner. A stack
    of one is left as a lite: nothing says which it is.

    Face IDs live on Editable Poly/Mesh, so anything else in the selection is
    collapsed first (convert=True, the default; undoable). Pass convert=False
    to leave import classes and modifier stacks untouched and skip them.

    A selected object that is not one lite but CONTAINS lites — a
    triple-glazed panel imported as one mesh, framing included — is split
    into per-lite objects first (undoable, like everything here); the
    framing stays behind untagged. The user's selection is trusted at the
    object level as ever, but the shells inside a combined object were never
    hand-picked, so those are screened: min_pane_mm rejects glass-shim and
    setting-block shells, and hollow shells (frame caps) are never lites.
    """
    if rt is None:
        print("Run inside 3ds Max.")
        return []
    objs = _candidates(pattern)
    if not objs:
        print("Nothing to tag. Select objects or pass a pattern like '*glass*'.")
        return []

    plane_tol = _mm(plane_tol_mm)
    max_thickness = _mm(max_thickness_mm)
    axial_gap = _mm(axial_gap_mm)
    min_pane = _mm(min_pane_mm)

    records, skipped, converted, split = [], [], 0, 0
    with _UndoBlock():
        for obj in objs:
            if convert and rt.classOf(obj) not in (rt.Editable_Poly, rt.Editable_mesh):
                try:
                    rt.convertToPoly(obj)
                    converted += 1
                except Exception:  # noqa: BLE001
                    pass
            rec, why = _analyze_lite(obj, plane_tol, max_thickness)
            # A stack of 2+ lites outranks a single-lite pass — see
            # _split_stack on the equal-area tie that can false-pass a
            # whole combined panel as one thin lite.
            pieces, split_why = _split_stack(
                obj, plane_tol, max_thickness, min_pane, convert,
                min_lites=1 if rec is None else 2)
            if pieces is None:
                if rec is not None:
                    records.append(rec)
                else:
                    skipped.append((obj.name, split_why or why))
                continue
            split += 1
            for piece in pieces:
                prec, pwhy = _analyze_lite(piece, plane_tol, max_thickness)
                if prec is not None:
                    records.append(prec)
                elif piece is obj:
                    skipped.append((piece.name, "non-lite remainder of the"
                                    " split (framing?), left untagged"))
                else:
                    skipped.append((piece.name, pwhy))

        if not records:
            print("g2m: nothing tagged — no selected object passed the lite"
                  " test.")
            for name, why in skipped:
                print("  skipped %s: %s" % (name, why))
            return []

        groups = _pick_exterior(_group_igus(records, axial_gap, lateral_factor))
        for group in groups:
            group.sort(key=lambda r: _dot(r["center"], r["ext_axis"]), reverse=True)

        pans, lone = [], 0
        if pan_behind:
            lone = sum(1 for g in groups if len(g) < 2)
            groups, pans = _strip_pans(groups)
            for rec in pans:
                obj = rec["obj"]
                rt.setUserProp(obj, PROP_TAGGED, "1")
                rt.setUserProp(obj, PROP_IGU, POSITION_PAN)
                rt.setUserProp(obj, PROP_POSITION, POSITION_PAN)

        for igu_idx, group in enumerate(groups):
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

    print("g2m: tagged %d lites in %d IGUs; skipped %d%s%s%s."
          % (len(records) - len(pans), len(groups), len(skipped),
             "; %d back pans (innermost sheet of each stack)" % len(pans) if pans else "",
             "; split %d combined objects into per-lite objects (undoable)"
             % split if split else "",
             "; collapsed %d to Editable Poly (undoable)" % converted if converted else ""))
    if pan_behind and lone:
        print("  %d stack(s) had a single sheet, left as a lite: nothing says"
              " whether it is glass or the pan. Use 'Tag selection as back"
              " pan' on the pans by hand." % lone)
    for name, why in skipped:
        print("  skipped %s: %s" % (name, why))
    # Everything this call stamped, split pieces included, so the color
    # check that follows can stay on exactly these objects.
    return [rec["obj"] for rec in records]


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


def qa(objects=None):
    """Assign the red/blue/green diagnostic Multi-Sub to tagged lites.
    Orbit the model: exterior must read green everywhere.

    Scope follows the same rule as Assign: the tagged lites in `objects`
    (the GUI passes what Tag just stamped), else the viewport selection,
    else everything tagged. Field lesson 2026-09-01: checking a spandrel
    selection used to repaint the vision lites bound an hour earlier."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    if objects is None:
        sel = list(rt.selection)
        scope = "selection" if sel else "everything tagged"
        objects = [o for o in _tagged_objects() if not sel or _is_selected(o)]
    else:
        scope = "just tagged"
    mm = rt.MultiMaterial(numsubs=3)
    mm.name = "g2m_QA"
    for mat_id, (label, rgb) in QA_COLORS.items():
        mm.materialList[mat_id - 1] = _diag_material("g2m_QA_%s" % label, rgb)
        mm.names[mat_id - 1] = label
    tagged = [o for o in objects if not _is_pan(o)]
    for obj in tagged:
        obj.material = mm
    print("g2m: QA material on %d objects (%s). Green out, red in, blue"
          " edges. Lites bound earlier keep their materials unless they are"
          " in scope." % (len(tagged), scope))


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


def _is_pan(obj):
    return str(rt.getUserProp(obj, PROP_POSITION)) == POSITION_PAN


def _igus_of(objects):
    igus = {}
    for obj in objects:
        igu = rt.getUserProp(obj, PROP_IGU)
        if igu is not None and str(igu) != POSITION_PAN:
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
            print("     Move it there, then assign again.")
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


#: Envelope data from the last load_manifest() call that bind() needs beyond
#: the type mapping: the roller wave entry and the export folder (where the
#: bump map lives). Module-level so console users get the wiring for free.
_manifest_extras = {"roller_wave": None, "dir": None}


def load_manifest(path):
    """Read a bind_manifest.json from a glass2mdl volumetric export.

    Returns the factory-shaped mapping for make_iray_mdl_factory. Accepts both
    the shipped envelope ({"format": ..., "types": {...}}) and a bare mapping.
    Also records the manifest's roller_wave entry and folder, which bind()
    uses to wire the bump map into each material.

        ga.bind({"*gl-01*": "v5227_dgu"},
                material_factory=ga.make_iray_mdl_factory(
                    ga.load_manifest(r"C:\\path\\to\\bind_manifest.json")))
    """
    import json
    import os
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    _manifest_extras["roller_wave"] = data.get("roller_wave")
    _manifest_extras["dir"] = os.path.dirname(os.path.abspath(path))
    return data.get("types", data)


#: Field-calibrated look (Jeff, 2026-08-27, real project scene): one map
#: tile spread over 20 ft x 20 ft real-world, output amount 0.1. That
#: stretches the baked waves to a gentle ~2.5 ft period, the soft warp real
#: curtainwall shows at a distance. Tweak here, or on the bitmap node.
ROLLER_WAVE_SIZE_MM = 6096.0  # 20 ft per map tile
ROLLER_WAVE_OUTPUT_AMOUNT = 0.1  # at the "typical" depth preset


def _roller_wave_bitmap():
    """One shared Max bitmap node for the manifest's roller wave bump map.

    Returns (bitmap, depth_multiplier) or (None, 1.0) when the manifest has no
    roller wave or the file is missing. The map is grayscale height (bright =
    high), applied at real-world scale; depth is the bitmap's output amount,
    scaled per preset relative to "typical"."""
    rw = _manifest_extras.get("roller_wave")
    folder = _manifest_extras.get("dir")
    if not rw or not folder:
        return None, 1.0
    import os
    path = os.path.join(folder, str(rw.get("file", "roller_wave_bump.png")))
    if not os.path.isfile(path):
        print("g2m: roller wave map not found at %s (skipping the ripple)." % path)
        return None, 1.0
    mult = {"subtle": 0.4, "typical": 1.0, "strong": 1.9}.get(
        str(rw.get("depth", "typical")), 1.0)
    try:
        bmp = rt.BitmapTexture()
        try:
            # Height data, not color: load without the display gamma curve.
            bmp.bitmap = rt.openBitMap(path, gamma=1.0)
        except Exception:  # noqa: BLE001
            bmp.filename = path
        bmp.name = "g2m roller wave"
        try:
            size = _mm(ROLLER_WAVE_SIZE_MM)
            bmp.coords.realWorldScale = True
            bmp.coords.realWorldWidth = size
            bmp.coords.realWorldHeight = size
        except Exception as exc:  # noqa: BLE001
            print("g2m: could not set real-world scale on the roller wave map"
                  " (%s); set it on the bitmap node by hand." % exc)
        try:
            bmp.output.output_amount = ROLLER_WAVE_OUTPUT_AMOUNT * mult
        except Exception:  # noqa: BLE001
            pass
        return bmp, mult
    except Exception as exc:  # noqa: BLE001
        print("g2m: could not create the roller wave bitmap: %s" % exc)
        return None, 1.0


def _wire_roller_wave(mat, bmp):
    """Wire the bump map into the material's geometry normal map slot.

    The sockets Slate shows on the Iray+ material (geometry opacity / normal /
    displacement) are the material's SUB-TEXMAP SLOTS, so enumerate those the
    way Slate does; plain properties are only a fallback for other plugin
    spellings. The normal socket is field-confirmed to distort rendered
    reflections (hand-wired maps, 2026-08-27). Depth lives on the bitmap's
    output amount, set by _roller_wave_bitmap, so no amount property is
    touched here. Returns True when wired."""

    def is_normal(name):
        ln = name.lower()
        return "normal" in ln and "reflect" not in ln

    # 1. Sub-texmap slots: what Slate renders as input sockets.
    slot_names = []
    try:
        count = int(rt.getNumSubTexmaps(mat))
    except Exception:  # noqa: BLE001
        count = 0
    best = None
    for i in range(1, count + 1):
        try:
            name = str(rt.getSubTexmapSlotName(mat, i))
        except Exception:  # noqa: BLE001
            name = ""
        slot_names.append(name)
        if is_normal(name):
            score = 2 if "geometry" in name.lower() else 1
            if best is None or score > best[0]:
                best = (score, i, name)

    wired = False
    if best is not None:
        try:
            rt.setSubTexmap(mat, best[1], bmp)
            wired = True
        except Exception as exc:  # noqa: BLE001
            print("g2m: setSubTexmap on '%s' failed: %s" % (best[2], exc))

    # 2. Property fallback, plus an enable sweep either way.
    try:
        names = [str(n) for n in rt.getPropNames(mat)]
    except Exception:  # noqa: BLE001
        names = []
    if not wired:
        for n in names:
            ln = n.lower()
            if is_normal(n) and not any(
                k in ln for k in ("amount", "strength", "factor", "enable", "_on")
            ):
                try:
                    rt.setProperty(mat, n, bmp)
                    wired = True
                    break
                except Exception:  # noqa: BLE001
                    continue

    if wired:
        for n in names:
            ln = n.lower()
            if is_normal(n) and ("enable" in ln or ln.endswith("_on")):
                try:
                    rt.setProperty(mat, n, True)
                except Exception:  # noqa: BLE001
                    pass
    elif slot_names:
        # Nothing matched: name what exists, so the next fix is data-driven.
        print("g2m: no normal slot among this material's sockets: %s"
              % ", ".join(repr(s) for s in slot_names if s))
    return wired


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
    # bind() leaves lites typed for any OTHER product alone instead of
    # handing them an empty Multi-Sub.
    factory.known_prefixes = set(manifest)
    # A spandrel back pan is sheet metal: the manifest marks its type
    # roller_wave: false and bind() leaves the ripple off it.
    factory.no_roller = {
        prefix for prefix, entry in manifest.items()
        if isinstance(entry, dict) and entry.get("roller_wave") is False
    }
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


def _ensure_uv(obj):
    """Give a lite a predictable 1m x 1m box UV mapping (map channel 1) plus
    a per-object UV offset.

    The exported roller wave bump map and frit patterns assume one UV unit
    equals one meter; the box map provides that. The offset is the
    variability: every object samples a different region of the shared maps,
    so no two lites carry the identical ripple. It is derived from the
    object's name (FNV-1a), so re-running Assign materials is stable. Both
    are ordinary modifiers and undo with everything else."""
    try:
        m = rt.Uvwmap()
        m.maptype = 4  # box
        one_m = _mm(1000.0)
        m.length = one_m
        m.width = one_m
        m.height = one_m
        m.mapChannel = 1
        rt.addModifier(obj, m)
    except Exception as exc:  # noqa: BLE001
        print("g2m: could not add a UVW Map to %s: %s" % (obj.name, exc))
        return False
    h = 2166136261
    for ch in str(obj.name):
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    try:
        x = rt.Uvw_Xform()
        x.U_Offset = (h & 0xFFFF) / 65535.0 * 8.0
        x.V_Offset = ((h >> 16) & 0xFFFF) / 65535.0 * 8.0
        if h & 1:
            x.U_Flip = True
        rt.addModifier(obj, x)
    except Exception as exc:  # noqa: BLE001
        print("g2m: could not add the per-object UV offset to %s: %s" % (obj.name, exc))
    return True


def bind(type_map=None, material_factory=None, add_uv=True, objects=None):
    """Build one Multi-Sub per (glazing type, lite position) and assign it.

    The glazing type of each lite resolves in order:
      1. the `g2m_type` stamp from assign_type() (selection-based typing), then
      2. type_map: {name_or_layer_fnmatch_pattern: glass2mdl_export_prefix},
         e.g. {"*curtain*": "v5227_dgu"} — the option for models whose names
         or layers identify the type.
    Either alone is enough; lites resolving to no type are left untouched and
    counted as unmatched. Lites typed for a product the factory cannot build
    (a vision type while assigning a spandrel manifest, say) are left alone
    too — never handed an empty Multi-Sub — as are positions the manifest
    has no material for.

    objects limits the pass to those tagged objects (the GUI passes the
    viewport selection); None means every tagged object in the scene.

    material_factory(prefix, position, slot) -> material or None, where slot
    is one of "exterior"/"interior"/"edge". The Iray+ MDL discovery run
    (scripts/max/discover_iray_mdl_api.py) PASSED 2026-08-25, so automatic
    creation is available: pass
    material_factory=make_iray_mdl_factory(manifest) (see EXAMPLE_MANIFEST).
    Leave it None to keep the one-drag-per-type fallback: slots stay empty and
    each is a single drag from the material browser, once per type not per IGU.

    add_uv (default True) gives each lite a 1m x 1m box UVW Map plus a
    per-object UV offset, which the exported roller wave and frit patterns
    assume; pass False to leave mapping untouched.
    """
    if rt is None:
        print("Run inside 3ds Max.")
        return
    multis, foreign, unbound = {}, {}, {}
    bound = unmatched = uv_mapped = 0
    # One shared bitmap: every lite material gets the same map node, and the
    # per-object UV offsets below are what keep the ripple varied.
    roller_bmp, _roller_mult = _roller_wave_bitmap() if material_factory else (None, 1.0)
    roller_wired = 0
    known = getattr(material_factory, "known_prefixes", None)
    no_roller = getattr(material_factory, "no_roller", set()) or set()
    for obj in (_tagged_objects() if objects is None else objects):
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
        if known is not None and prefix not in known:
            foreign[prefix] = foreign.get(prefix, 0) + 1
            continue
        position = str(rt.getUserProp(obj, PROP_POSITION))
        key = (prefix, position)
        if key in unbound:
            unbound[key] += 1
            continue
        if key not in multis:
            slots = ("exterior", "interior", "edge")
            mats = [material_factory(prefix, position, slot) if material_factory else None
                    for slot in slots]
            if material_factory is not None and all(m is None for m in mats):
                # The manifest knows the product but has nothing for this lite
                # position (a double-glazed export on a scene tagged as
                # triple, say). An empty Multi-Sub would blank the object.
                unbound[key] = 1
                continue
            mm = rt.MultiMaterial(numsubs=3)
            mm.name = "g2m_%s_%s" % (prefix, position)
            for i, (slot, mat) in enumerate(zip(slots, mats)):
                mm.names[i] = "%s face (ID%d)" % (slot, i + 1)
                mm.materialList[i] = mat
                if mat is not None and roller_bmp is not None and prefix not in no_roller:
                    if _wire_roller_wave(mat, roller_bmp):
                        roller_wired += 1
            multis[key] = mm
        # A pan has no ripple and no pattern to map; the box UV stays off it.
        if add_uv and position != POSITION_PAN and _ensure_uv(obj):
            uv_mapped += 1
        obj.material = multis[key]
        bound += 1
    print("g2m: assigned %d objects to %d Multi-Sub materials; %d unmatched."
          % (bound, len(multis), unmatched))
    for pfx, n in sorted(foreign.items()):
        print("g2m: left %d lites alone: typed '%s', which is another product"
              " this manifest does not carry." % (n, pfx))
    for (pfx, pos), n in sorted(unbound.items()):
        if pos == POSITION_PAN:
            print("g2m: left %d back pans alone: '%s' ships no pan material"
                  " (a flood-coated spandrel hides its pan; a shadow box"
                  " exports a '%s_pan' type)." % (n, pfx, pfx))
            continue
        print("g2m: left %d lites alone: '%s' has no material for the '%s'"
              " lite position. Check the tagging, or re-export with the"
              " matching lite count." % (n, pfx, pos))
    if add_uv:
        print("g2m: UV mapped %d lites (1m box map + per-object offset, so the"
              " roller wave varies lite to lite)." % uv_mapped)
    if roller_bmp is not None:
        if roller_wired:
            print("g2m: wired the roller wave bump map into %d materials"
                  " (geometry normal channel; the 'g2m roller wave' bitmap is"
                  " visible in Slate). Real-world size 20ft x 20ft, output"
                  " amount %.2f; tweak both on the bitmap node."
                  % (roller_wired, ROLLER_WAVE_OUTPUT_AMOUNT * _roller_mult))
        else:
            print("g2m: could not find the geometry normal channel; wire"
                  " 'g2m roller wave' (%s) into it by hand in Slate: check"
                  " Use Real-World Scale, size 20ft x 20ft, Output Amount 0.1."
                  % _manifest_extras["roller_wave"].get("file", "roller_wave_bump.png"))
    if material_factory is None and multis:
        print("Slots are empty by design. Drag the glass2mdl materials from")
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
    for key in sorted(igus, key=lambda k: int(k) if k.isdigit() else -1):
        listing = ", ".join("%s(%s)" % pair for pair in igus[key])
        if key == POSITION_PAN:
            print("  back pans: %s" % listing)
        else:
            print("  IGU %s: %s" % (key, listing))


def untag_selected():
    """Untag ONLY the current selection — for a frame piece or other false
    positive that slipped past the screens, so one bad tag doesn't force
    clear_tags() on the whole scene. Face IDs and the type stamp are left
    alone; qa() and bind() key off the tag, so an untagged object simply
    drops out of both. If a real lite was untagged by mistake, re-run tag()
    on its IGU — the remaining lites keep stale positions otherwise."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    n = 0
    for obj in rt.selection:
        tagged = rt.getUserProp(obj, PROP_TAGGED)
        if tagged == 1 or str(tagged) == "1":
            rt.setUserProp(obj, PROP_TAGGED, "0")
            rt.setUserProp(obj, PROP_IGU, "")
            rt.setUserProp(obj, PROP_POSITION, "")
            n += 1
    print("g2m: untagged %d of %d selected objects." % (n, len(list(rt.selection))))


def tag_as_pan():
    """Tag the current selection as spandrel back pans: no face IDs, no IGU
    grouping — one material covers every face of a pan, and its lite
    position is whatever the manifest's `_default` entry binds. Use it for
    pans the lite test rejects (folded sheet metal, insulated boxes) or that
    Tag would otherwise read as a third lite. Then, with the spandrel
    manifest loaded: pick its `_pan` type, Mark selection as this type,
    Assign materials."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    sel = list(rt.selection)
    if not sel:
        print("g2m: nothing selected. Select the back pans first.")
        return
    n = skipped = 0
    for obj in sel:
        tagged = rt.getUserProp(obj, PROP_TAGGED)
        if (tagged == 1 or str(tagged) == "1") and not _is_pan(obj):
            skipped += 1
            continue  # a tagged lite; Untag selected first if it is really a pan
        rt.setUserProp(obj, PROP_TAGGED, "1")
        rt.setUserProp(obj, PROP_IGU, POSITION_PAN)
        rt.setUserProp(obj, PROP_POSITION, POSITION_PAN)
        n += 1
    print("g2m: tagged %d objects as back pans (no face IDs; one material"
          " per pan)." % n)
    if skipped:
        print("g2m: left %d alone: already tagged as lites. Untag selected"
              " first if they are really pans." % skipped)
    print("  Next: load the spandrel manifest, choose its '_pan' type, Mark"
          " selection as this type, Assign materials.")


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
        print("g2m: nothing selected. Select your glazing solids first —"
              " lites as their own objects, or combined IGU objects (Tag"
              " splits those per lite).")
        return []
    plane_tol = _mm(plane_tol_mm)
    max_thickness = _mm(max_thickness_mm)
    min_pane = _mm(min_pane_mm)
    ok, bad, stacked = [], [], []
    for obj in sel:
        rec, why = _probe_lite(obj, plane_tol, max_thickness, max_faces,
                               min_extent=min_pane)
        if rec is not None and rec["extent_min"] < min_pane:
            rec, why = None, ("narrower than %.0fmm in-plane (frame profile?)"
                              % min_pane_mm)
        if rec is None:
            bad.append((str(obj.name), why))
        else:
            ok.append(obj)
            if rec.get("lites", 1) > 1:
                stacked.append((str(obj.name), rec["lites"]))
    print("g2m: %d of %d selected objects look like lites." % (len(ok), len(sel)))
    for name, count in stacked[:15]:
        print("  %s: %d lites in one object; Tag will split it into separate"
              " per-lite objects (undoable), leaving any framing behind."
              % (name, count))
    for name, why in bad[:15]:
        print("  not a lite, %s: %s" % (name, why))
    if len(bad) > 15:
        print("  ... and %d more" % (len(bad) - 15))
    if ok and not bad:
        print("  All good. Next: Tag + color check.")
    elif ok:
        print("  You can Tag now; the objects above will be skipped.")
    return ok


def debug_shells(max_faces=20000, plane_tol_mm=1.0, max_thickness_mm=60.0,
                 min_pane_mm=200.0):
    """Explain the current selection shell by shell: what the splitter sees
    and which screen accepts or rejects each shell, with the numbers behind
    every verdict. Touches nothing — run it when Check or Tag says something
    surprising, and read (or send back) the log."""
    if rt is None:
        print("Run inside 3ds Max.")
        return
    sel = list(rt.selection)
    if not sel:
        print("g2m: nothing selected. Select the objects to explain first.")
        return
    plane_tol = _mm(plane_tol_mm)
    max_thickness = _mm(max_thickness_mm)
    mm = _mm(1.0)  # system units per millimeter, for printing
    for obj in sel:
        loops, why = _snapshot_loops(obj, max_faces)
        if loops is None:
            print("g2m: %s: %s" % (obj.name, why))
            continue
        shells = _elements(loops, plane_tol)
        print("g2m: %s: %d faces in %d shell(s)" % (obj.name, len(loops), len(shells)))
        shells.sort(key=len, reverse=True)
        for i, faces in enumerate(shells, 1):
            rec, shell_why = _analyze_loops(loops, plane_tol, max_thickness,
                                            faces=faces)
            if rec is None:
                verdict = shell_why
            elif rec["fill"] < 0.35:
                verdict = ("rejected: covers %.0f%% of its bounds"
                           " (hollow — frame cap?)" % (rec["fill"] * 100))
            elif rec["extent_min"] < _mm(min_pane_mm):
                verdict = ("rejected: %.0fmm in-plane, narrower than the"
                           " %.0fmm pane minimum (setting block?)"
                           % (rec["extent_min"] / mm, min_pane_mm))
            else:
                verdict = ("LITE — thickness %.1fmm, %.0fmm x %.0fmm,"
                           " covers %.0f%% of its bounds"
                           % (rec["thickness"] / mm, rec["extent_u"] / mm,
                              rec["extent_v"] / mm, rec["fill"] * 100))
            print("  shell %d (%d faces): %s" % (i, len(faces), verdict))
            if rec is not None:
                continue
            # The numbers behind a rejection: the shell's planar face
            # groups, largest first, offsets along the biggest one's normal.
            clusters = _cluster_faces(loops, plane_tol, faces=faces)
            clusters.sort(key=lambda c: c["area"], reverse=True)
            ref_n = clusters[0]["n"] if clusters else (0.0, 0.0, 1.0)
            base = _dot(ref_n, clusters[0]["center"]) if clusters else 0.0
            for cl in clusters[:10]:
                ext = _cluster_extents(loops, cl)
                d = _dot(cl["n"], ref_n)
                print("    plane %+8.1fmm along stack, facing %s, %3d faces,"
                      " %.0fmm x %.0fmm, covers %3.0f%% of bounds"
                      % ((_dot(ref_n, cl["center"]) - base) / mm,
                         "same" if d > 0.98 else
                         ("oppo" if d < -0.98 else "side"),
                         len(cl["faces"]), ext["extent_u"] / mm,
                         ext["extent_v"] / mm, ext["fill"] * 100))
            if len(clusters) > 10:
                print("    ... and %d more planes" % (len(clusters) - 10))
        stack = _analyze_stack(loops, plane_tol, max_thickness,
                               _mm(min_pane_mm))
        if stack is not None:
            print("  => stack: %d lites%s; Tag will split them out."
                  % (len(stack["lites"]),
                     " via sheet pairing (glass welded to framing)"
                     if stack.get("fused") else " as separate shells"))


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
        print("g2m: module resolves. Ready to assign.")
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
    revision = _script_revision()
    dlg.setWindowTitle("glass2mdl - apply to modeled IGUs  ·  rev %s" % revision)
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

    # 0 - Optional practice scene
    lay0 = group("0 · Try it without a model (optional)",
                 "Skip this if your glazing geometry is already in the scene. "
                 "It drops a few synthetic IGU boxes to practise the steps "
                 "below on.")
    row0 = QtWidgets.QHBoxLayout()
    btn_test = QtWidgets.QPushButton("Build test scene")
    row0.addWidget(btn_test)
    row0.addStretch(1)
    lay0.addLayout(row0)
    btn_test.clicked.connect(lambda: run(build_test_scene))

    # 1 - Select
    lay1 = group("1 · Select the glazing",
                 "In the viewport, select the glazing solids you want to "
                 "convert — lites as their own objects, or whole IGU "
                 "objects (Tag splits those per lite, framing left alone) — "
                 "then check them here. Nothing is modified by the check.")
    row1 = QtWidgets.QHBoxLayout()
    btn_check = QtWidgets.QPushButton("Check my selection")
    row1.addWidget(btn_check)
    row1.addStretch(1)
    lay1.addLayout(row1)
    btn_check.clicked.connect(lambda: run(check_selection, redraw=False))

    # 2 - Tag + check
    lay2 = group("2 · Tag faces + color check",
                 "Assigns face IDs on the selection (1 exterior / 2 interior / "
                 "3 edges) and paints the check colors. Orbit the model: "
                 "exterior glass must read GREEN. Red outside? Select it and "
                 "flip.")
    chk_convert = QtWidgets.QCheckBox(
        "Collapse to Editable Poly when needed (undoable; required for face IDs)")
    chk_convert.setChecked(True)
    lay2.addWidget(chk_convert)
    chk_pan = QtWidgets.QCheckBox(
        "Spandrel shadow box: the innermost sheet of each stack is the metal "
        "back pan (tag it as a pan, not a lite)")
    chk_pan.setToolTip(
        "Revit exports a spandrel with its pan as one object, and the pan is "
        "a thin solid that passes the lite test. Tick this for spandrel "
        "selections so a dual-glazed unit tags as outer/inner + pan instead "
        "of outer/center/inner. Leave it off for vision glazing.")
    lay2.addWidget(chk_pan)
    row2 = QtWidgets.QHBoxLayout()
    btn_tag = QtWidgets.QPushButton("Tag + color check")
    btn_flip = QtWidgets.QPushButton("Flip selected")
    btn_flip_all = QtWidgets.QPushButton("Flip all")
    btn_pan = QtWidgets.QPushButton("Tag selection as back pan")
    btn_pan.setToolTip(
        "Spandrel shadow boxes: the metal pan behind the glass gets one "
        "material on every face and no face IDs. Select the pans (not the "
        "glass) and press this; assign them later from the spandrel "
        "manifest's '_pan' type.")
    row2.addWidget(btn_tag)
    row2.addWidget(btn_flip)
    row2.addWidget(btn_flip_all)
    row2.addWidget(btn_pan)
    row2.addStretch(1)
    lay2.addLayout(row2)
    btn_pan.clicked.connect(lambda: run(tag_as_pan, redraw=False))

    def do_tag():
        nodes = tag(convert=chk_convert.isChecked(), pan_behind=chk_pan.isChecked())
        if nodes:
            qa(objects=nodes)
    btn_tag.clicked.connect(lambda: run(do_tag))
    btn_flip.clicked.connect(lambda: run(flip_selected))
    btn_flip_all.clicked.connect(lambda: run(flip_all))

    # 3 - Bind
    lay3 = group("3 · Assign the real materials",
                 "Point at the bind_manifest.json inside the downloaded, "
                 "unzipped export folder. The export folder must sit DIRECTLY "
                 "under a folder listed in Iray+ settings > MDL search paths; "
                 "choosing the manifest checks this for you before any material "
                 "is assigned.")
    row3a = QtWidgets.QHBoxLayout()
    btn_manifest = QtWidgets.QPushButton("Choose bind_manifest.json...")
    lbl_manifest = QtWidgets.QLabel("no manifest loaded")
    lbl_manifest.setStyleSheet("color: gray;")
    row3a.addWidget(btn_manifest)
    row3a.addWidget(lbl_manifest, 1)
    lay3.addLayout(row3a)
    lbl_multi = QtWidgets.QLabel(
        "This manifest carries several types: select each type's objects in "
        "the viewport and mark them, then Assign materials. A '_pan' type is "
        "a spandrel back pan: select the pans you tagged as back pans and "
        "mark them with it.")
    lbl_multi.setWordWrap(True)
    lbl_multi.setStyleSheet("color: gray;")
    lbl_multi.hide()
    lay3.addWidget(lbl_multi)
    row3b = QtWidgets.QHBoxLayout()
    combo_type = QtWidgets.QComboBox()
    combo_type.setMinimumWidth(180)
    btn_stamp = QtWidgets.QPushButton("Mark selection as this type")
    btn_bind = QtWidgets.QPushButton("Assign materials")
    combo_type.hide()
    btn_stamp.hide()
    row3b.addWidget(combo_type)
    row3b.addWidget(btn_stamp)
    row3b.addWidget(btn_bind)
    row3b.addStretch(1)
    lay3.addLayout(row3b)
    lbl_uv = QtWidgets.QLabel(
        "Assigning also wires the roller wave bump map into each material's "
        "geometry normal channel (find the 'g2m roller wave' bitmap in "
        "Slate), and adds a 1 m UV map modifier so it lands at true scale. "
        "Mapping only; the glass shape is untouched. Each object gets a "
        "small offset so no two lites ripple alike.")
    lbl_uv.setWordWrap(True)
    lbl_uv.setStyleSheet("color: gray;")
    lay3.addWidget(lbl_uv)

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
                print("  One type only: Assign materials applies it to the selection,"
                      " or to everything tagged when nothing is selected.")
            pans = [k for k in keys if k.endswith("_pan")]
            if pans:
                print("  Spandrel back pan type %s: select the pans (tagged as back"
                      " pans), Mark selection as this type, then Assign."
                      % ", ".join(pans))
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

        # A viewport selection scopes Assign to the tagged lites in it, so a
        # second product (the spandrel ZIP after the vision ZIP) reaches only
        # the lites it is for. Nothing selected: everything tagged, as before.
        targets = _tagged_objects()
        if list(rt.selection):
            targets = [o for o in targets if _is_selected(o)]
            if not targets:
                print("g2m: nothing in the selection is tagged. Tag it first,"
                      " or clear the selection to assign to everything tagged.")
                return
            print("g2m: assigning to the %d tagged lites in the selection."
                  % len(targets))

        if len(keys) == 1:
            # One type in the manifest: Assign means "apply THIS product to
            # the lites in scope". Type stamps from an earlier product are
            # stale state there, not intent — overwrite them, and say so.
            only = next(iter(keys))
            stamped = restamped = 0
            for obj in targets:
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
            for obj in targets:
                cur = current_type(obj)
                if cur is not None and cur not in keys:
                    strays[cur] = strays.get(cur, 0) + 1
            for t, n in sorted(strays.items()):
                print("g2m: %d lites are typed '%s', which this manifest does"
                      " not offer; left alone. Select them and Mark as one"
                      " of: %s" % (n, t, ", ".join(sorted(keys))))
        bind(material_factory=make_iray_mdl_factory(manifest), objects=targets)
    btn_bind.clicked.connect(lambda: run(do_bind))

    # Extras + log
    row4 = QtWidgets.QHBoxLayout()
    btn_report = QtWidgets.QPushButton("Report")
    btn_shells = QtWidgets.QPushButton("Shell details")
    btn_shells.setToolTip(
        "Explains, shell by shell, why the last check or tag accepted or "
        "rejected each piece of the selection, with the numbers. Run it "
        "when a result surprises you.")
    btn_untag = QtWidgets.QPushButton("Untag selected")
    btn_clear = QtWidgets.QPushButton("Clear tags")
    row4.addWidget(btn_report)
    row4.addWidget(btn_shells)
    row4.addWidget(btn_untag)
    row4.addWidget(btn_clear)
    row4.addStretch(1)
    root.addLayout(row4)
    btn_report.clicked.connect(lambda: run(report, redraw=False))
    btn_shells.clicked.connect(lambda: run(debug_shells, redraw=False))
    btn_untag.clicked.connect(lambda: run(untag_selected, redraw=False))
    btn_clear.clicked.connect(lambda: run(clear_tags))

    root.addWidget(log)

    dlg.show()
    _GUI = dlg
    log.appendPlainText(
        "Script revision %s.\n"
        "Workflow: select your glazing in the viewport > Check > Tag + color "
        "check > flip anything red-out > choose the manifest > Assign "
        "materials.\n"
        "No Material ID setup is needed beforehand; tagging does it."
        % revision)
    print("g2m: window open (script rev %s). If you closed it, run this"
          " script again." % revision)


if __name__ == "__main__":
    show_gui()
