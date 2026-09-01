# Physics and assumptions

What the solver does with a cutsheet, and where it is approximating. Everything
here is visible-band and normal-incidence unless stated otherwise, and all
colour arithmetic is RGB — spectral data arrives with IGDB import.

## The problem

A cutsheet reports three numbers for the whole assembly: visible transmittance,
exterior visible reflectance, interior visible reflectance. A renderer needs
properties per lite, and MDL needs them as BSDF parameters. Going from one to
the other is an inverse problem with more unknowns than measurements, so the
model below is what pins it down.

## Interfaces and lites

Glazing lites are thousands of wavelengths thick, so interference is
irrelevant and intensities add. A lite is two interfaces around an absorbing
body:

```
T  = τ_f · t · τ_b / (1 − r_f,int · r_b,ext · t²)
Rf = r_f,ext + τ_f² · r_b,ext · t² / (1 − r_f,int · r_b,ext · t²)
Rb = r_b,int + τ_b² · r_f,int · t² / (1 − r_f,int · r_b,ext · t²)
```

where `t` is single-pass internal transmittance and each interface has a
reflectance per side plus a transmittance. The denominators are the infinite
series of internal bounces.

For bare glass both interfaces are air/glass at n = 1.52:

```
r₀ = ((n − 1) / (n + 1))² ≈ 0.0426
```

which is symmetric in both directions at normal incidence.

Lites combine through the standard net-radiation result, folded left to right
for triples:

```
T  = T₁T₂ / (1 − R₁b·R₂f)
Rf = R₁f + T₁²·R₂f / (1 − R₁b·R₂f)
Rb = R₂b + T₂²·R₁b / (1 − R₁b·R₂f)
```

Gas fill is ignored: argon and air are optically indistinguishable in the
visible band.

## Inverting a single pane

For a bare lite the forward relation reduces to
`T = (1−r)²t / (1 − r²t²)`, which rearranges to a quadratic in `t`:

```
(T r²) t² + (1−r)² t − T = 0
```

The positive root gives the body transmittance — the same inversion Radiance
uses to turn a measured pane transmittance into its transmissivity. Beer-Lambert
then converts it to the absorption coefficient MDL wants:

```
σ = −ln(t) / d        (per metre)
```

Sanity check: 6 mm clear float at 88% Tvis gives t ≈ 0.958 and σ ≈ 7.2/m, which
matches published clear float values.

## Colour: hue and level are separate

VLT is one photopic number but the output needs RGB. The split throughout is:

- **Level** always comes from the measured transmittance or reflectance.
- **Hue** comes from measured colour data where the cutsheet provides it, and
  from the nominal substrate tint table where it does not.

A normalized hue is scaled until its photopic luminance equals the measured
value. Where that would drive a channel above 1, the colour is blended toward
neutral rather than clipped, so luminance is still met — a saturated tint
otherwise could never reach a high VLT.

### Measured colour

Architectural glass colour is published as CIELAB under illuminant D65, the
convention ASTM C1376 and D2244 are written around. L\* runs about 20–97 across
real products and chroma usually sits within ±20. D65 is also the sRGB white
point, so **Lab converts straight to linear sRGB with no chromatic adaptation** —
a genuine simplification rather than a shortcut past one.

Three formats are accepted, because cutsheets disagree: CIELAB (technical
documents), CIE x,y chromaticity (some European sheets), and an eyedropped
swatch (product sheets that print a colour square and a CRI number, like Vitro's
own Solarban 60 sheet).

Only hue is taken from these. L\* also encodes level, which makes the two
statements cross-checkable: a transmitted colour of L\*≈87 and a visible
transmittance of 70% say the same thing twice, so a large disagreement is a
data-entry error and raises a warning naming both numbers.

**Observer.** Glass colour is often measured against the CIE 1964 10° observer,
while the sRGB matrices are defined against the 1931 2° observer. The observer is
recorded for provenance and written into the generated file header, but the
conversion uses the 2° matrices regardless: the difference is well below the
other approximations in this pipeline, and pretending otherwise would imply a
precision that is not there.

### Nominal fallback

Substrate data lives in `src/engine/physics/constants.ts` as internal
transmittance at 6 mm, rescaled to other thicknesses through Beer-Lambert.
Values are representative of published monolithic performance (clear ~88%,
low-iron ~91%, green ~75%, gray ~43%, bronze ~52%, blue ~55% at 6 mm) decomposed
into RGB to carry each substrate's characteristic hue.

**This remains the weakest link whenever no colour is measured.** A single VLT
cannot determine a spectrum, so an un-measured hue is a nominal guess. Entering
colour data removes the guess for that quantity; IGDB import will eventually
replace the table with real spectral curves.

## Fitting the assembly

Targets are built as RGB, then each channel is fitted independently — three
scalar problems rather than one vector problem.

**With a coating** there are three unknowns (transmittance, and a reflectance
from each side) against three measurements, so substrates stay at their nominal
absorption and the coating closes the fit. Each unknown is monotonic in the
measurement it owns, so cycling bisections converges quickly. Absorptance is
checked to stay non-negative on both sides.

**Without a coating** there is one free parameter — a common exponent on
substrate absorption — so transmittance is honored exactly and the reflectances
fall where the physics puts them. The residual is reported rather than hidden;
for genuinely clear glass it is near zero, and a large residual is real
information that the entered numbers do not describe the configured build-up.

Targets outside what any real construction can produce return the closest
achievable answer plus a residual, rather than failing.

## Spandrel: the finish is taken as given

A spandrel is not a product with its own data sheet. It is a glazing build-up
chosen from an ordinary glazing sheet — coated or not — with an opaque finish
the manufacturer offers behind it: a flood coat (opaque paint fused to the
back of a lite, typically #4 on a double unit) or a metal back pan behind an
air cavity (a shadow box). So the glass is fitted exactly as vision glass, and
the finish is the one place in the tool where a colour sets **level as well as
hue**: nothing measures it, so it is applied at face value and the result is
reported rather than solved for.

The forward calculation reuses the slab and stack relations above. A flood
coat replaces the painted lite's back interface with an opaque reflector,
`r_ext = ρ`, `r_int = 0`, `τ = 0`, where `ρ` is the finish albedo per channel;
lites behind it are hidden and dropped. A back pan is an opaque element
`T = 0, Rf = ρ` after the whole glass stack, the cavity being optically empty.
Either way the number that matters is the exterior reflectance of the
composed panel — the finish seen through this glass, darkened by a double
pass through every lite in front of it and topped by their own reflections —
because that, not the finish alone, is what a render has to be judged
against. The tool reports it as "reads as" beside the glass's own reflection.

A metallic pan finish keeps the same albedo for that number and lowers to a
glossy reflector in the export; its angular look is a BSDF assumption, not
data.

## Known approximations

**Coated volumetric export: structure decided, emitter pending.** MDL applies a
solid's `surface` to its entire boundary and ignores `backface` on
non-thin-walled materials (render-confirmed, kit test 02), so a coating meant
for surface #2 would also appear on #1. The validated replacement is a
**Material-ID assembly**: each face of the solid gets its own surface material
— the coated face a transmit-only base under a fitted `custom_curve_layer`,
replacing the interface — while body absorption sits in a `volume` kept
identical on every ID. One material per lite, per-lite values from the fit.
Transmission is validated to −0.2% against a real product; absolute per-face
reflectance still awaits a mirror-rig measurement. Until the Material-ID
emitter lands, the export remains refused and planar mode handles coated
glazing. See [iray-findings.md](iray-findings.md).

**A layer can only add reflection.** MDL's layering functions mix —
`w·layer + (1−w)·base` — so nothing layered on top of glass can reflect less
than the glass underneath. Real low-e coatings do exactly that (Solarban 60
returns 11% where uncoated double glazing returns ~14%, because the silver sits
inside dielectric anti-reflective layers), which is why a coating has to replace
the interface rather than sit on it, and why a single coating plane cannot
reproduce a low-e cutsheet. Refraction survives the substitution: a
transmit-only specular BSDF still bends light by the material IOR.

**Schlick instead of measured angular data.** Coating reflectance rises from the
fitted normal-incidence value to full mirror reflection at grazing, on a
5th-power curve. Cutsheets only report normal incidence, so the angular shape is
assumed.

**One coating at a time.** A second coating adds unknowns with no additional
measurement to fit them against.

**Frit sits outside the fit.** Cutsheet values describe the vision area, so
glazing is fitted to those numbers and frit is layered over the result. Light
through the fritted area reads lower, which is correct.

**Normal incidence throughout.** Every measurement and every fit is at normal
incidence; angular behavior comes from the BSDF model, not from data.
