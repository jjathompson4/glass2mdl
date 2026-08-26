# Iray validation protocol

Generate the kit, render it, record what happened. One session answers the
questions that reading the MDL specification cannot — including the one
currently blocking volumetric export of coated glazing.

```bash
pnpm emit:validation-kit
```

Writes eight test modules plus a `PROTOCOL.txt` carrying the same instructions
into the kit itself, and a ZIP ready to move onto the render machine. The
materials go through the real emitter, so the kit exercises the code that ships
rather than a parallel hand-written copy.

## Why this exists

Every material this tool generates has been checked against the specification
and never against a compiler. Most of those assumptions are low-risk. One is
not:

> A solid's `surface` applies to its entire boundary, and MDL states that
> `backface` is ignored for non-thin-walled materials. A coating specified for
> surface #2 therefore also lands on surface #1.

Real glass has bare float at #1 and low-e at #2, so this is wrong by a wide
margin rather than subtly. Coated volumetric exports are refused until a render
says which structure to use instead.

The tempting fix — one coating plane layered over the glass, as frit already
does — cannot represent a real low-e coating:

- An uncoated 6mm+6mm clear IGU computes to ~78% VLT and ~14% exterior
  reflectance.
- Vitro publishes Solarban 60 (2) Clear+Clear at 70% VLT and **11%** exterior.

Low-e stacks are silver wrapped in dielectric anti-reflective layers, so surface
#2 genuinely reflects below the 4.26% bare-glass Fresnel. A plane can only add
reflection, never subtract it, leaving a floor around 12–12.8% exterior
reflectance at 70% VLT. Every low-e product would read 1–2 points high.

Reaching the real numbers means *replacing* surface #2's reflection. Which
mechanism can do that is what the kit determines.

## Scene

One scene for every test, so results stay comparable.

| | |
|---|---|
| Environment | Uniform white, intensity 1.0, no HDRI |
| Camera | Perpendicular to the sample, filling most of the frame |
| Backdrop | Matte black behind the sample |
| Samples | Converged — noise reads as colour error |
| Units | Metres |

A flat environment means a reflected fraction reads directly off the rendered
pixel. The black backdrop stops transmitted light returning and contaminating
that reading. Scene units matter because absorption is specified per metre; a
mis-scaled scene changes the answer.

Geometry:
- A 1m × 1m plane with a UVW Map modifier set to 1.0m × 1.0m
- A closed box, 1m × 1m × 6mm
- A second such box with Material IDs 1 and 2 on opposite large faces

Install by unpacking the kit onto an MDL search path in Iray for 3ds Max, then
loading each module from the material browser.

## Tests

| # | Question | Passing result |
|---|---|---|
| 01 | Does `backface` work on a thin-walled material? | Red front, blue back. Planar export's interior reflectance depends on this. |
| 02 | Is `backface` ignored on a solid? | Both faces red. **Blue anywhere is the most valuable result in the kit** — it would solve the coating problem outright. |
| 03 | Do Material IDs give a solid's faces different surfaces? | Red exterior, blue opposite face, glass still absorbing. |
| 04 | What happens when two Material IDs disagree about the volume? | Unknown by design — record which one wins, or whether it breaks. Decides whether 03 is safe to rely on. |
| 05 | Does a thin decal sit cleanly 0.1mm off a solid? | Green reflection, no z-fighting or speckle. Frit already ships depending on this. |
| 06 | Can a reflection-free solid plus Fresnel planes replace normal glass? | Indistinguishable from test 07. |
| 07 | Control: ordinary 6mm clear glass | ~8% reflectance, ~88% transmittance at normal incidence. |
| 08 | Does a procedural frit pattern land at true physical size? | 6mm dots on 12mm centres — ~83 across one metre, ~20% coverage. |

Record for each: whether it loaded, what you saw, and **any Iray log warnings
even where the render looked correct**.

## What the results decide

Read in order; the first match wins.

1. **Test 02 shows `backface` working on solids** → use `backface`. No extra
   geometry, no extra planes, problem gone.
2. **Tests 03 and 04 both pass** → use Material IDs. Still no extra geometry;
   setup instructions grow.
3. **Test 06 matches test 07** → reflection-free solid plus two planes. Exact,
   at the cost of geometry the user has to build.
4. **None of the above** → single coating plane, with a documented 1–2 point
   reflectance error on low-e products, surfaced as residual.

Test 08 independently settles whether the `1 UV unit = 1 metre` convention holds
or the `frit_pattern_scale` default needs changing.

Findings go into [`mdl-compat.md`](mdl-compat.md), which already lists the open
questions this kit closes.
