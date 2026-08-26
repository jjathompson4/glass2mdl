"""Run this ONE file in 3ds Max to build a test scene and bind materials.

    3ds Max 2024:  Scripting menu > Run Script... > fully_auto_build.py

It builds a synthetic test scene, tags each lite (exterior/interior/edge face
IDs), colour-codes the faces for a quick visual QA, and binds the Iray+ MDL
materials automatically. Safe on an empty scene — it only creates its own test
geometry. To run on a real model, replace build_test_scene()/tag() below.
"""
import os
import sys

# Let "import glass2mdl_apply" resolve when launched via Run Script.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

# Max caches imported modules for the whole session, so an old glass2mdl_apply
# can shadow edits (e.g. a "missing" V5227_DGU_MANIFEST). Purge it so the import
# below always reads the current file from disk.
for _name in [m for m in sys.modules if m == "glass2mdl_apply" or m.startswith("glass2mdl_apply.")]:
    del sys.modules[_name]

import glass2mdl_apply as ga


def main():
    ga.build_test_scene()   # double-lite IGUs -> outer + inner lite positions
    ga.tag()                # geometric face IDs: 1=exterior 2=interior 3=edge
    # ACCURATE per-lite V5227 DGU: outer lite = low-iron + surface-2 low-e,
    # inner lite = clear low-iron. (EXAMPLE_MANIFEST is the collapsed proxy.)
    ga.bind(
        {"*": "v5227_dgu"},
        material_factory=ga.make_iray_mdl_factory(ga.V5227_DGU_MANIFEST),
    )
    print("=" * 60)
    print("DONE. Outer lites carry the coating; inner lites are clear.")
    print("Render (Iray+) to confirm; assembly should read ~53% VLT.")
    print("=" * 60)


main()
