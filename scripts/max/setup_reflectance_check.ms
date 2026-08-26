/*
Near-normal specular reflectance check for the AGC V5227 assembly reference.

Reuses the existing overhead photometric light. A sample plane is tilted a small
angle so the overhead beam reflects to a dedicated receiver; measuring the same
geometry with the sample material and then the perfect_mirror reference gives
R = E_sample / E_mirror at near-normal incidence.

Only creates/removes nodes whose names begin with REFL_. Plane-Glass, Plane-Ground,
and Plane-Emissive are hidden during the test and restored by BYOReflectanceCheck.restore().
*/

global BYOReflectanceCheck

struct BYOReflectanceCheckStruct
(
    sampleName = "Plane-Glass",
    hideDuringTest = #("Plane-Glass", "Plane-Ground", "Plane-Emissive"),
    prefix = "REFL_",
    tiltDeg = 10.0,
    receiverDistanceFeet = 4.0,
    sampleSizeFeet = 2.0,
    receiverSizeFeet = 6.0,

    fn feet value =
    (
        local scale = units.SystemScale as float
        if scale <= 0.0 do throw "Max system-unit scale must be greater than zero."
        local valueInSystemType = case units.SystemType of
        (
            #Inches: value * 12.0
            #Feet: value
            #Miles: value / 5280.0
            #Millimeters: value * 304.8
            #Centimeters: value * 30.48
            #Meters: value * 0.3048
            #Kilometers: value * 0.0003048
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

    fn build =
    (
        local glass = uniqueNode sampleName
        deleteExisting()

        for n in hideDuringTest do
        (
            local matches = for node in objects where node.name == n collect node
            for node in matches do ( hide node; node.renderable = false )
        )

        -- Tilted sample at the original sample location so the existing overhead light still lights it.
        local sample = plane length:(feet sampleSizeFeet) width:(feet sampleSizeFeet) lengthsegs:1 widthsegs:1 name:(prefix + "Sample")
        sample.position = glass.position
        in coordsys world (rotate sample (angleaxis tiltDeg [1,0,0]))
        sample.wirecolor = color 80 180 255

        -- Reflection of the straight-down beam off the tilted sample face.
        local n = normalize sample.transform.row3
        local d = [0,0,-1]
        local r = normalize (d - 2.0 * (dot d n) * n)

        local recvPos = sample.position + r * (feet receiverDistanceFeet)
        local receiver = plane length:(feet receiverSizeFeet) width:(feet receiverSizeFeet) lengthsegs:1 widthsegs:1 name:(prefix + "Receiver")
        local savedPos = recvPos
        receiver.transform = matrixFromNormal (-r)
        receiver.position = savedPos
        receiver.material = standardMaterial name:(prefix + "Receiver_Black") diffuse:(color 0 0 0) specularLevel:0 glossiness:0
        receiver.wirecolor = color 80 255 120

        local camTarget = targetObject name:(prefix + "Camera.Target")
        camTarget.position = receiver.position
        local cam = targetCamera name:(prefix + "Camera")
        cam.target = camTarget
        cam.position = receiver.position - r * (feet receiverDistanceFeet) + [(feet receiverDistanceFeet), 0, 0]
        cam.fov = 45.0

        local grp = group #(sample, receiver, cam, camTarget) name:(prefix + "Rig")
        select grp
        viewport.setCamera cam

        format "\nReflectance check rig created (tilt % deg, reflection at % deg from vertical).\n" tiltDeg (2.0 * tiltDeg)
        format "Assign materials to REFL_Sample and measure E on REFL_Receiver:\n"
        format "  1. agc_v5227_dgu_assembly_reference, normal UP (exterior toward light) -> E_ext\n"
        format "  2. add a Normal modifier with Flip Normals (interior toward light)     -> E_int\n"
        format "  3. perfect_mirror, normal UP                                           -> E_mirror\n"
        format "Predicted E_sample / E_mirror: exterior 0.17, interior 0.13, interior/exterior 0.765.\n"
        format "Run BYOReflectanceCheck.restore() to remove the rig and unhide the transmission scene.\n\n"
        grp
    ),

    fn restore =
    (
        deleteExisting()
        for n in hideDuringTest do
        (
            local matches = for node in objects where node.name == n collect node
            for node in matches do ( unhide node; node.renderable = true )
        )
        format "Reflectance rig removed; transmission scene restored.\n"
    )
)

BYOReflectanceCheck = BYOReflectanceCheckStruct()

try
(
    BYOReflectanceCheck.build()
    messageBox "Reflectance rig created. Assign REFL_Sample materials per the Listener, measure REFL_Receiver." title:"Glazing Reflectance Check"
)
catch
(
    format "Reflectance Check: %\n" (getCurrentException())
    messageBox ("Reflectance rig failed. See MAXScript Listener.\n\n" + getCurrentException()) title:"Glazing Reflectance Check"
)
