/**
 * Iray validation kit.
 *
 * The generated MDL in this repo has never been compiled — there is no MDL
 * compiler here — so a handful of load-bearing assumptions rest on reading the
 * specification. The most consequential one blocks real work: a solid's
 * `surface` covers its whole boundary, so a coating meant for surface #2 also
 * lands on #1. Three structures could avoid that, and which is viable depends
 * on Iray behaviour no document settles.
 *
 * This writes a set of deliberately contrasting materials, each paired with an
 * expected result, so one render session answers the question with evidence.
 * Materials go through the real emitter rather than being hand-written, so the
 * kit also exercises the code that ships.
 *
 * Run: pnpm emit:validation-kit
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { rollerWaveNormalMap } from "../src/engine/mdl/emit/rollerWave";
import { emitModule } from "../src/engine/mdl/emit/module";
import { absorptionCoefficient } from "../src/engine/physics/slab";
import { AIR_GLASS_R0, GLASS_IOR } from "../src/engine/physics/constants";
import type { MaterialIR } from "../src/engine/types/ir";
import type { RGB } from "../src/engine/types/optics";

const OUT_DIR = process.argv[2] ?? path.join(process.cwd(), "validation-kit");

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });
const WHITE = rgb(1, 1, 1);

/** Strongly separated hues, so a mix-up is obvious at a glance in a render. */
const RED = rgb(0.9, 0.1, 0.1);
const BLUE = rgb(0.1, 0.2, 0.9);
const GREEN = rgb(0.1, 0.8, 0.2);

/** 6mm clear float: body transmittance 0.958, absorption ≈ 7.2 per metre. */
const CLEAR_SIGMA = absorptionCoefficient(0.958, 0.006);
const CLEAR_ABSORPTION = rgb(CLEAR_SIGMA, CLEAR_SIGMA, CLEAR_SIGMA);

interface KitEntry {
  slug: string;
  title: string;
  question: string;
  expected: string;
  materials: MaterialIR[];
}

function material(partial: Partial<MaterialIR> & Pick<MaterialIR, "name" | "displayName">): MaterialIR {
  return {
    description: partial.displayName,
    thinWalled: false,
    ior: GLASS_IOR,
    layers: [],
    params: [],
    moduleFunctions: [],
    comments: [],
    ...partial,
  };
}

/** A coating layer at a chosen normal-incidence reflectance and colour. */
const coating = (reflectivity: number, color: RGB) =>
  ({ kind: "fresnel-coating", normalReflectivity: reflectivity, grazingReflectivity: 1, reflectColor: color }) as const;

const glassBase = (mode: "reflect_transmit" | "transmit") =>
  ({ kind: "specular-base", tint: WHITE, scatterMode: mode }) as const;

const ENTRIES: KitEntry[] = [
  {
    slug: "01_thinwalled_backface",
    title: "Does backface work on a thin-walled material?",
    question:
      "Apply to a single flat plane. View it from the front, then from behind.",
    expected:
      "RED from the front, BLUE from behind. If both sides look the same, backface is not being honoured and the planar export's interior reflectance is wrong.",
    materials: [
      material({
        name: "test01_thinwalled_backface",
        displayName: "01 thin-walled backface",
        thinWalled: true,
        layers: [coating(0.5, RED), glassBase("transmit")],
        backface: { layers: [coating(0.5, BLUE), glassBase("transmit")] },
        comments: [
          "Front reflects RED, back reflects BLUE.",
          "Both sides identical means backface was ignored.",
        ],
      }),
    ],
  },
  {
    slug: "02_solid_backface",
    title: "Is backface ignored on a solid, as the specification says?",
    question: "Apply to a closed box. View the exterior face, then the opposite face.",
    expected:
      "Both faces RED. BLUE anywhere means Iray honours backface on solids after all — which would solve the coating problem outright and is the single most valuable result in this kit.",
    materials: [
      material({
        name: "test02_solid_backface",
        displayName: "02 solid backface",
        thinWalled: false,
        layers: [coating(0.5, RED), glassBase("transmit")],
        backface: { layers: [coating(0.5, BLUE), glassBase("transmit")] },
        volume: { absorptionCoefficient: CLEAR_ABSORPTION },
        comments: [
          "Same material as test 01 but not thin-walled.",
          "Expected: backface ignored, so both faces reflect RED.",
        ],
      }),
    ],
  },
  {
    slug: "03_faceid_same_volume",
    title: "Do Material IDs give a solid's faces different surfaces?",
    question:
      "One box. Material ID 1 on the exterior face, ID 2 on the opposite face. Assign these two as a Multi-Sub-Object. Volume absorption is identical in both.",
    expected:
      "Exterior face RED, opposite face BLUE, and the glass still absorbs (a thick sample should darken). This is the key test: if it passes, coated lites need no extra geometry at all.",
    materials: [
      material({
        name: "test03_faceid_bare",
        displayName: "03a face ID - bare (slot 1)",
        layers: [coating(AIR_GLASS_R0, RED), glassBase("transmit")],
        volume: { absorptionCoefficient: CLEAR_ABSORPTION },
        comments: ["Assign to Material ID 1 - the exterior face.", "Reflects RED at about 4%."],
      }),
      material({
        name: "test03_faceid_coated",
        displayName: "03b face ID - coated (slot 2)",
        layers: [coating(0.35, BLUE), glassBase("transmit")],
        volume: { absorptionCoefficient: CLEAR_ABSORPTION },
        comments: ["Assign to Material ID 2 - the gap-facing face.", "Reflects BLUE at 35%."],
      }),
    ],
  },
  {
    slug: "04_faceid_conflicting_volume",
    title: "What happens when two Material IDs disagree about the volume?",
    question:
      "Same setup as test 03, but the two materials specify different absorption. Note which one wins, or whether it breaks.",
    expected:
      "Unknown — that is the point. Record whether the volume follows the entry face, the first slot, blends, or renders incorrectly. Determines whether test 03's approach is safe to rely on.",
    materials: [
      material({
        name: "test04_volume_clear",
        displayName: "04a conflicting volume - clear (slot 1)",
        layers: [coating(AIR_GLASS_R0, RED), glassBase("transmit")],
        volume: { absorptionCoefficient: CLEAR_ABSORPTION },
        comments: ["Assign to Material ID 1.", "Nearly clear glass."],
      }),
      material({
        name: "test04_volume_dark",
        displayName: "04b conflicting volume - dark (slot 2)",
        layers: [coating(AIR_GLASS_R0, BLUE), glassBase("transmit")],
        volume: { absorptionCoefficient: rgb(120, 120, 120) },
        comments: ["Assign to Material ID 2.", "Heavily absorbing - about 49% over 6mm."],
      }),
    ],
  },
  {
    slug: "05_decal_offset",
    title: "Does a thin decal sit cleanly on a solid?",
    question:
      "Place the plane 0.1mm off one face of a glass box and assign the decal material. Look for z-fighting, shadow artefacts, and whether the reflection reads correctly.",
    expected:
      "GREEN reflection with no flicker or speckling. Frit already depends on this working, so a failure here affects shipped output.",
    materials: [
      material({
        name: "test05_decal",
        displayName: "05a decal plane",
        thinWalled: true,
        layers: [coating(0.4, GREEN), glassBase("transmit")],
        comments: ["Apply to a plane offset 0.1mm from the glass face."],
      }),
      material({
        name: "test05_host_glass",
        displayName: "05b host glass solid",
        layers: [glassBase("reflect_transmit")],
        volume: { absorptionCoefficient: CLEAR_ABSORPTION },
        comments: ["Apply to the box the decal sits against."],
      }),
    ],
  },
  {
    slug: "06_reflectionfree_plus_plane",
    title: "Can a reflection-free solid plus a Fresnel plane replace normal glass?",
    question:
      "Box gets the reflection-free material; add a plane 0.1mm off each face with the Fresnel material. Render beside test 07 under identical lighting.",
    expected:
      "Indistinguishable from test 07. If it matches, this structure can carry a coating on exactly one face — including coatings that reflect less than bare glass, which a plane layered over normal glass can never do.",
    materials: [
      material({
        name: "test06_reflectionfree_solid",
        displayName: "06a reflection-free solid",
        layers: [glassBase("transmit")],
        volume: { absorptionCoefficient: CLEAR_ABSORPTION },
        comments: [
          "Refraction and absorption only - no surface reflection at all.",
          "Reflection is supplied by the planes in 06b instead.",
        ],
      }),
      material({
        name: "test06_fresnel_plane",
        displayName: "06b bare-glass Fresnel plane",
        thinWalled: true,
        layers: [coating(AIR_GLASS_R0, WHITE), glassBase("transmit")],
        comments: ["Apply to planes 0.1mm off both large faces of the 06a box."],
      }),
    ],
  },
  {
    slug: "07_reference_glass",
    title: "Control: ordinary 6mm clear glass",
    question: "Apply to a 6mm-thick box. Everything else is compared against this.",
    expected:
      "About 8% reflectance and 88% transmittance measured at normal incidence.",
    materials: [
      material({
        name: "test07_reference_glass",
        displayName: "07 reference 6mm clear",
        layers: [glassBase("reflect_transmit")],
        volume: { absorptionCoefficient: CLEAR_ABSORPTION },
        comments: ["Control sample. 6mm clear float, Fresnel from the material IOR."],
      }),
    ],
  },
  {
    slug: "08_frit_pattern_scale",
    title: "Does a procedural frit pattern land at its true physical size?",
    question:
      "Apply to a 1m x 1m plane with a UVW Map modifier set to 1.0m x 1.0m. Measure a dot and count the spacing.",
    expected:
      "6mm dots on 12mm centres — about 83 dots across one metre, covering roughly 20% of the surface. A different size means the 1 UV unit = 1 metre convention does not hold and the frit_pattern_scale default needs changing.",
    materials: [
      material({
        name: "test08_frit_pattern",
        displayName: "08 frit pattern scale",
        thinWalled: true,
        layers: [{ kind: "frit", color: WHITE, opacity: 1, weight: { kind: "uniform", coverage: 1 } }],
        cutoutOpacity: { kind: "function", functionName: "test08_dot_coverage" },
        params: [
          {
            name: "frit_pattern_scale",
            type: "float",
            defaultValue: 1,
            displayName: "Frit pattern scale",
            description: "Leave at 1.0 for this test.",
          },
        ],
        moduleFunctions: [
          { kind: "dot-pattern", name: "test08_dot_coverage", dotDiameterMm: 6, spacingMm: 12 },
        ],
        comments: ["6mm dots on 12mm centres. Requires a 1m x 1m UVW map."],
      }),
    ],
  },
  {
    slug: "09_roller_wave",
    title: "Does the roller wave normal map ripple reflections at true scale?",
    question:
      "Copy roller_wave_normal.png (emitted next to this kit) beside the .mdl. Apply to a 1m x 1m plane AND to the closed box, both with a 1.0m x 1.0m UVW Map. View a bright reflection at a grazing angle.",
    expected:
      "Reflections ripple with roughly a 300mm period and the ripple visibly varies across the surface rather than repeating a uniform sine. Raising roller_wave_strength to 0.2 makes it obvious; 0 turns the surface optically flat. A flat surface at the default means normal maps in material_geometry do not work in this build.",
    materials: [
      material({
        name: "test09_roller_wave",
        displayName: "09 roller wave",
        layers: [coating(0.15, WHITE), glassBase("transmit")],
        normalMap: { textureFileName: "roller_wave_normal.png", uvwFunction: "test09_roller_uvw" },
        params: [
          {
            name: "roller_wave_strength",
            type: "float",
            defaultValue: 0.03125,
            displayName: "Roller wave strength",
            description: "Default matches a typical 0.08mm wave; try 0.2 to exaggerate, 0 to disable.",
          },
          {
            name: "roller_wave_scale",
            type: "float",
            defaultValue: 1,
            displayName: "Roller wave scale",
            description: "Leave at 1.0 for this test.",
          },
        ],
        moduleFunctions: [
          { kind: "roller-wave-uvw", name: "test09_roller_uvw", direction: "horizontal" },
        ],
        comments: ["Requires roller_wave_normal.png beside the module and a 1m x 1m UVW map."],
      }),
    ],
  },
  {
    slug: "10_object_variation",
    title: "Does state::object_id() give materials per-object identity?",
    question:
      "Apply this one material to four or more separate boxes and render.",
    expected:
      "Each box shows a DIFFERENT red coverage level. Identical levels on every box mean object_id is constant in this build, and per-object variation must keep coming from the apply script's UV offsets (the current approach) rather than from inside the material.",
    materials: [
      material({
        name: "test10_object_variation",
        displayName: "10 object id probe",
        thinWalled: true,
        layers: [
          { kind: "frit", color: RED, opacity: 1, weight: { kind: "function", functionName: "test10_object_value" } },
          glassBase("transmit"),
        ],
        moduleFunctions: [{ kind: "object-id-probe", name: "test10_object_value" }],
        comments: ["Probe: red coverage is math::frac(object_id * phi)."],
      }),
    ],
  },
];

function buildProtocol(): string {
  const lines = [
    "IRAY VALIDATION KIT",
    "===================",
    "",
    "Every material glass2mdl generates has been checked against the MDL",
    "specification and never against a compiler. These samples answer the",
    "questions that reading cannot, and one of them is currently blocking work:",
    "how to give the two faces of a solid pane different surfaces.",
    "",
    "SCENE SETUP",
    "-----------",
    "Use one scene for everything so results stay comparable.",
    "",
    "  - Environment: uniform white, intensity 1.0, no HDRI. A flat environment",
    "    means a reflected fraction reads directly off the rendered pixel.",
    "  - Camera: perpendicular to the sample, filling most of the frame.",
    "  - Samples: enough to converge cleanly - noise reads as colour error.",
    "  - Backdrop: matte black behind the sample, so transmitted light does not",
    "    come back and contaminate the reflectance reading.",
    "  - Units: scene in metres. Absorption is per metre and a mis-scaled scene",
    "    changes the answer.",
    "",
    "Geometry needed:",
    "  - A flat plane, 1m x 1m, with a 1.0m x 1.0m UVW Map modifier.",
    "  - A closed box 1m x 1m x 6mm, for the solid tests.",
    "  - A second box with Material IDs 1 and 2 assigned to opposite large faces.",
    "",
    "INSTALLING",
    "----------",
    "Unpack this folder somewhere on an MDL search path in Iray for 3ds Max,",
    "then load each module from the material browser.",
    "",
    "WHAT TO RECORD",
    "--------------",
    "For each test: whether it loaded, what you saw, and any Iray log warnings",
    "even when the render looked right. Copy the results table at the bottom",
    "into docs/mdl-compat.md when you are done.",
    "",
  ];

  ENTRIES.forEach((entry, i) => {
    lines.push(
      `${"-".repeat(72)}`,
      `TEST ${String(i + 1).padStart(2, "0")}: ${entry.title}`,
      `File: ${entry.slug}.mdl`,
      "",
      "  Setup:",
      ...wrap(entry.question, 68, "    "),
      "",
      "  Expected:",
      ...wrap(entry.expected, 68, "    "),
      "",
      "  Materials:",
      ...entry.materials.map((m) => `    ${m.name}  (${m.displayName})`),
      "",
    );
  });

  lines.push(
    "=".repeat(72),
    "RESULTS",
    "",
    "Test  Loaded  Matched expectation  Notes",
    ...ENTRIES.map(
      (e, i) => `${String(i + 1).padStart(2, "0")}    [ ]     [ ]                  ${e.slug}`,
    ),
    "",
    "Iray for 3ds Max version: ______________",
    "3ds Max version: ______________",
    "Date: ______________",
    "",
    "DECISION THIS KIT UNBLOCKS",
    "--------------------------",
    "Volumetric export of coated glazing is currently refused, because a",
    "coating meant for surface #2 would also appear on #1.",
    "",
    "  If test 02 shows backface working on solids  -> use backface; no extra",
    "    geometry, no extra planes, problem gone.",
    "  Else if tests 03 and 04 both pass            -> use Material IDs; still",
    "    no extra geometry, but the setup instructions grow.",
    "  Else if test 06 matches test 07              -> reflection-free solid",
    "    plus two planes; exact, at the cost of geometry the user must build.",
    "  Else                                         -> single coating plane and",
    "    a documented 1-2 point reflectance error on low-e products.",
    "",
  );

  return lines.join("\n");
}

function wrap(text: string, width: number, indent: string): string[] {
  const out: string[] = [];
  let line = indent;
  for (const word of text.split(/\s+/)) {
    if (line.length + word.length + 1 > width && line.trim()) {
      out.push(line.trimEnd());
      line = indent;
    }
    line += `${word} `;
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

function main(): void {
  const files: Record<string, Uint8Array> = {};
  const folder = "glass2mdl_iray_validation_kit";

  for (const entry of ENTRIES) {
    const emitted = emitModule(entry.slug, entry.materials, [
      entry.title,
      "",
      ...wrap(`Setup: ${entry.question}`, 74, ""),
      "",
      ...wrap(`Expected: ${entry.expected}`, 74, ""),
    ]);
    files[`${folder}/${emitted.fileName}`] = strToU8(emitted.source);
  }

  files[`${folder}/PROTOCOL.txt`] = strToU8(buildProtocol());
  // Test 09 samples this map; it ships in the kit like it ships in exports.
  files[`${folder}/roller_wave_normal.png`] = rollerWaveNormalMap();

  mkdirSync(OUT_DIR, { recursive: true });

  // Loose files for reading, plus the ZIP for moving onto the render machine.
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(path.join(OUT_DIR, path.basename(name)), bytes);
  }
  writeFileSync(path.join(OUT_DIR, `${folder}.zip`), zipSync(files, { level: 6 }));

  console.log(`Validation kit written to ${OUT_DIR}`);
  console.log(`  ${ENTRIES.length} test modules + PROTOCOL.txt`);
  console.log(`  ${folder}.zip ready for the render machine`);
}

main();
