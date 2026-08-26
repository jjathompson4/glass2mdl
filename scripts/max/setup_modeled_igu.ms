/*
Track A modeled-IGU builder for the glazing pipeline (plan steps 8-11).

Builds a SYNTHETIC modeled DGU on the existing transmission harness so the
surface-2 coating-plane approach can be validated against the planar reference
before the architecture team's real IGU model is available. Geometry matches
the validated AGC 22 DGU 2.4 V5227 Low-iron construction:

    surface 1  ---- outer lite (6 mm low-iron glass) ----  surface 2 (coating)
                        12 mm cavity (air / argon, no glass)
    surface 3  ---- inner lite (6 mm low-iron glass) ----  surface 4

Light comes from overhead, so exterior = +Z (up). The stack is centred on the
existing Plane-Glass so the camera, section-plane region, and Plane-Ground
receiver still frame the same spot. Plane-Glass is hidden during the modeled
test and restored afterward.

Non-destructive: creates/deletes ONLY nodes whose names begin with MIGU_, and
only hides/unhides Plane-Glass. Nothing else in the scene is touched.

Materials are assigned by hand in the Material Editor after building (the repo's
proven human-in-loop pattern):
    MIGU_LiteOuter, MIGU_LiteInner  ->  agc_glass_lite.mdl
    MIGU_Coating_S2                 ->  agc_coating_surface2.mdl

Usage (MAXScript Listener):
    BYOModeledIGU.build()              -- build at the default coating offset
    BYOModeledIGU.setOffset 0.2        -- move the coating plane (mm into cavity)
    BYOModeledIGU.sweep #(0.05,0.1,0.2,0.5,1.0)  -- reposition for an offset check
    BYOModeledIGU.restore()            -- remove MIGU_* and unhide Plane-Glass
*/

global BYOModeledIGU

struct BYOModeledIGUStruct
(
    sampleName = "Plane-Glass",
    prefix = "MIGU_",
    ownerId = "SYN-DGU-V5227",

    outerLiteMm = 6.0,
    cavityMm = 12.0,
    innerLiteMm = 6.0,
    coatingOffsetMm = 0.1,   -- coating plane sits this far into the cavity from surface 2

    -- Convert a physical millimetre length to the scene's system-unit count.
    fn mm value =
    (
        local scale = units.SystemScale as float
        if scale <= 0.0 do throw "Max system-unit scale must be greater than zero."
        local valueInSystemType = case units.SystemType of
        (
            #Inches: value / 25.4
            #Feet: value / 304.8
            #Millimeters: value
            #Centimeters: value / 10.0
            #Meters: value / 1000.0
            #Kilometers: value / 1000000.0
            #Miles: value / 1609344.0
            default: throw ("Unsupported Max system-unit type: " + units.SystemType as string)
        )
        valueInSystemType / scale
    ),

    fn uniqueNode nodeName =
    (
        local matches = for node in objects where node.name == nodeName collect node
        if matches.count != 1 do
            throw ("Expected one node named '" + nodeName + "', found " + matches.count as string + ".")
        matches[1]
    ),

    fn deleteExisting =
    (
        local oldNodes = for node in objects where matchPattern node.name pattern:(prefix + "*") collect node
        if oldNodes.count > 0 do delete oldNodes
    ),

    fn coatingNode =
    (
        local matches = for node in objects where node.name == (prefix + "Coating_S2") collect node
        if matches.count == 1 then matches[1] else undefined
    ),

    -- Move only the coating plane to a new offset (mm into the cavity from surface 2).
    fn setOffset offsetMm =
    (
        local coating = coatingNode()
        if coating == undefined do throw "Build the modeled IGU first (BYOModeledIGU.build())."
        local glass = uniqueNode sampleName
        -- Surface 2 is the top of the cavity; the stack is centred on Plane-Glass.
        local surface2Z = glass.position.z + (mm (cavityMm * 0.5))
        coating.position = [glass.position.x, glass.position.y, surface2Z - (mm offsetMm)]
        coatingOffsetMm = offsetMm
        setUserProp coating "offset_mm" (offsetMm as string)
        format "Coating plane offset set to % mm into the cavity (z = %).\n" offsetMm coating.position.z
        coating
    ),

    fn sweep offsets =
    (
        format "\nOffset sweep - render each and watch for Z-fighting, parallax, edge leaks, double shadows, or altered T/R:\n"
        for o in offsets do format "  BYOModeledIGU.setOffset %\n" o
        format "Choose the SMALLEST offset with none of those artefacts.\n\n"
        if offsets.count > 0 do setOffset offsets[1]
    ),

    fn build =
    (
        local glass = uniqueNode sampleName
        deleteExisting()

        hide glass; glass.renderable = false

        local gp = glass.position
        -- Match the lites to the Plane-Glass world footprint.
        local sizeX = glass.max.x - glass.min.x
        local sizeY = glass.max.y - glass.min.y
        if sizeX <= 0.0 or sizeY <= 0.0 do throw "Plane-Glass has a zero-size footprint."

        -- Stack centred on Plane-Glass; exterior (+Z) up. Total = outer+cavity+inner.
        local halfCavity = mm (cavityMm * 0.5)
        local surface2Z = gp.z + halfCavity                 -- bottom of outer lite / top of cavity
        local surface1Z = surface2Z + (mm outerLiteMm)      -- top of outer lite
        local surface3Z = gp.z - halfCavity                 -- top of inner lite / bottom of cavity
        local surface4Z = surface3Z - (mm innerLiteMm)      -- bottom of inner lite

        -- Boxes are built from their base (+Z up), so position.z = the lower face.
        local outer = box length:sizeY width:sizeX height:(mm outerLiteMm) \
            name:(prefix + "LiteOuter")
        outer.position = [gp.x, gp.y, surface2Z]
        outer.wirecolor = color 120 200 255

        local inner = box length:sizeY width:sizeX height:(mm innerLiteMm) \
            name:(prefix + "LiteInner")
        inner.position = [gp.x, gp.y, surface4Z]
        inner.wirecolor = color 120 200 255

        -- Single-sided coating plane at surface 2, offset into the cavity. A
        -- Max plane's normal is +Z by default = exterior-facing, per convention.
        local coating = plane length:sizeY width:sizeX lengthsegs:1 widthsegs:1 \
            name:(prefix + "Coating_S2")
        coating.position = [gp.x, gp.y, surface2Z - (mm coatingOffsetMm)]
        coating.wirecolor = color 255 180 80

        -- Encode the outside->inside convention on each node.
        setUserProp outer "igu_owner" ownerId
        setUserProp outer "surface_top" "1"
        setUserProp outer "surface_bottom" "2"
        setUserProp outer "exterior_dir" "+Z"
        setUserProp inner "igu_owner" ownerId
        setUserProp inner "surface_top" "3"
        setUserProp inner "surface_bottom" "4"
        setUserProp inner "exterior_dir" "+Z"
        setUserProp coating "igu_owner" ownerId
        setUserProp coating "surface" "2"
        setUserProp coating "exterior_normal" "+Z"
        setUserProp coating "offset_mm" (coatingOffsetMm as string)

        -- Orientation check: coating normal must point outward (+Z).
        local nrm = normalize coating.transform.row3
        if (dot nrm [0,0,1]) < 0.999 do
            format "WARNING: MIGU_Coating_S2 normal is % , expected +Z (exterior). Check before rendering.\n" nrm

        local grp = group #(outer, inner, coating) name:(prefix + "IGU")

        format "\nModeled IGU built (owner %). Construction along +Z (exterior up):\n" ownerId
        format "  surface 1 (top)    z = %\n" surface1Z
        format "  surface 2 (coat)   z = %  (coating plane at % mm into cavity)\n" surface2Z coatingOffsetMm
        format "  surface 3          z = %\n" surface3Z
        format "  surface 4 (bottom) z = %\n" surface4Z
        format "Assign MDL materials in the Material Editor:\n"
        format "  MIGU_LiteOuter, MIGU_LiteInner -> agc_glass_lite.mdl\n"
        format "  MIGU_Coating_S2                -> agc_coating_surface2.mdl\n"
        format "Then, using the existing Illuminance rig and Plane-Ground receiver:\n"
        format "  1. Baseline/target: render the planar agc_v5227_dgu_assembly_reference on Plane-Glass (VLT 0.53 -> ~442.7 lux).\n"
        format "  2. Modeled: with Plane-Glass hidden (done), render this stack and read transmitted lux.\n"
        format "  3. Fit agc_coating_surface2 (coating_transmittance, reflectivity_exterior/interior) until modeled T matches the planar target within 2%%.\n"
        format "  4. Check reflectance asymmetry with the gray-floor method (exterior +Z up vs flipped).\n"
        format "  5. Run BYOModeledIGU.sweep #(0.05,0.1,0.2,0.5,1.0) to pick the smallest stable coating offset.\n"
        format "Run BYOModeledIGU.restore() to remove MIGU_* and unhide Plane-Glass.\n\n"
        grp
    ),

    fn restore =
    (
        deleteExisting()
        local matches = for node in objects where node.name == sampleName collect node
        for node in matches do ( unhide node; node.renderable = true )
        format "Modeled IGU removed; Plane-Glass restored.\n"
    )
)

BYOModeledIGU = BYOModeledIGUStruct()

try
(
    BYOModeledIGU.build()
    messageBox "Modeled IGU built. Assign MDL materials per the Listener, then fit the coating against the planar reference." title:"Glazing Modeled IGU"
)
catch
(
    format "Modeled IGU: %\n" (getCurrentException())
    messageBox ("Modeled IGU build failed. See MAXScript Listener.\n\n" + getCurrentException()) title:"Glazing Modeled IGU"
)
