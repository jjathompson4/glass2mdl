global BYOGlazingHarness

struct BYOGlazingHarnessStruct
(
    cameraName = "Camera001",
    cameraTargetName = "Camera001.Target",
    sourceName = "Plane-Emissive",
    sampleName = "Plane-Glass",
    receiverName = "Plane-Ground",

    fn uniqueNode nodeName =
    (
        local matches = for node in objects where node.name == nodeName collect node
        if matches.count != 1 do
            throw ("Expected one node named '" + nodeName + "', found " + matches.count as string + ".")
        matches[1]
    ),

    fn validateScene =
    (
        local cameraNode = uniqueNode cameraName
        uniqueNode cameraTargetName
        uniqueNode sourceName
        uniqueNode sampleName
        uniqueNode receiverName

        if superclassof cameraNode != camera do
            throw ("Node '" + cameraName + "' is not a camera.")

        cameraNode
    ),

    fn setOwnedNodeState sampleRenderable =
    (
        local cameraNode = validateScene()
        local sourceNode = uniqueNode sourceName
        local sampleNode = uniqueNode sampleName
        local receiverNode = uniqueNode receiverName

        unhide cameraNode
        unhide sourceNode
        unhide receiverNode
        sourceNode.renderable = true
        receiverNode.renderable = true

        if sampleRenderable then
        (
            unhide sampleNode
            sampleNode.renderable = true
        )
        else
        (
            hide sampleNode
            sampleNode.renderable = false
        )

        viewport.setCamera cameraNode
        cameraNode
    ),

    fn selectIray =
    (
        renderers.current = Iray()
        renderers.activeshade = Iray()
    ),

    fn setAnalysis enabled =
    (
        if not MAXScriptIrayPlusRenderer.LightingAnalysisAvailable do
            throw "Iray+ lighting analysis is not available in the current scene state."
        MAXScriptIrayPlusRenderer.EnableIrradiance = enabled
    ),

    fn prepareBaseline =
    (
        selectIray()
        setOwnedNodeState false
        setAnalysis true
    ),

    fn prepareSample =
    (
        selectIray()
        setOwnedNodeState true
        setAnalysis true
    ),

    fn startActiveShade =
    (
        selectIray()
        maxOps.startActiveShade()
    ),

    fn renderProduction =
    (
        local cameraNode = validateScene()
        selectIray()
        render camera:cameraNode
    )
)

BYOGlazingHarness = BYOGlazingHarnessStruct()

try (destroyDialog BYOGlazingHarnessRollout) catch()

rollout BYOGlazingHarnessRollout "Glazing Harness" width:250
(
    label statusLabel "Ready" width:220 align:#left
    button validateButton "Validate Scene" width:220
    button baselineButton "Prepare Baseline" width:220
    button sampleButton "Prepare Sample" width:220
    button analysisButton "Show Analysis" width:108 across:2
    button photorealButton "Show Photoreal" width:108
    button activeShadeButton "Start ActiveShade" width:220
    button productionButton "Render Production" width:220

    fn runAction action successText =
    (
        try
        (
            action()
            statusLabel.text = successText
        )
        catch
        (
            statusLabel.text = "Failed - see Listener"
            format "Glazing Harness: %\n" (getCurrentException())
        )
    )

    on validateButton pressed do
        runAction BYOGlazingHarness.validateScene "Scene validated"

    on baselineButton pressed do
        runAction BYOGlazingHarness.prepareBaseline "Baseline ready"

    on sampleButton pressed do
        runAction BYOGlazingHarness.prepareSample "Sample ready"

    on analysisButton pressed do
        runAction (fn setAnalysisOn = (BYOGlazingHarness.setAnalysis true)) "Analysis enabled"

    on photorealButton pressed do
        runAction (fn setAnalysisOff = (BYOGlazingHarness.setAnalysis false)) "Photoreal enabled"

    on activeShadeButton pressed do
        runAction BYOGlazingHarness.startActiveShade "ActiveShade started"

    on productionButton pressed do
        runAction BYOGlazingHarness.renderProduction "Production render complete"
)

createDialog BYOGlazingHarnessRollout