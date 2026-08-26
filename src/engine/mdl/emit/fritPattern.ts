import type { ModuleFunctionIR } from "../../types/ir";
import { num, stringLiteral, type CodeWriter, type ImportTracker } from "./writer";

/**
 * Frit coverage functions.
 *
 * Frit is specified in millimetres — a 6 mm dot on 12 mm centres — but MDL sees
 * texture coordinates. The bridge is the convention that one UV unit is one
 * metre, so millimetres divide down to UV distances directly. The exposed
 * `scale` parameter lets someone in Max fix a mismatched UVW map without coming
 * back here to regenerate.
 *
 * Edges are smoothstepped over a narrow band rather than hard-stepped: a hard
 * cutoff aliases badly on a facade seen at a distance, which is exactly how
 * frit is usually viewed.
 */

const EDGE_SOFTNESS = 0.06;

const mmToUv = (millimetres: number) => millimetres / 1000;

export function emitPatternFunction(
  writer: CodeWriter,
  imports: ImportTracker,
  fn: ModuleFunctionIR,
): void {
  const texCoord = `${imports.ref("state", "texture_coordinate")}(0)`;
  const floor = imports.ref("math", "floor");
  const smoothstep = imports.ref("math", "smoothstep");

  switch (fn.kind) {
    case "dot-pattern": {
      const spacing = mmToUv(fn.spacingMm);
      const radius = mmToUv(fn.dotDiameterMm) / 2;
      const edge = Math.max(radius * EDGE_SOFTNESS, 1e-5);

      writer
        .comment([
          `Dot frit: ${fn.dotDiameterMm}mm dots on ${fn.spacingMm}mm centres.`,
          `Coverage ${(((Math.PI * (fn.dotDiameterMm / 2) ** 2) / fn.spacingMm ** 2) * 100).toFixed(1)}%.`,
        ])
        .line(`export float ${fn.name}(uniform float scale = 1.0)`)
        .line("{")
        .indent()
        .line(`float pitch = ${num(spacing)} * scale;`)
        .line(`float3 uvw = ${texCoord};`)
        .line("float2 cell = float2(uvw.x, uvw.y) / pitch;")
        .line(`float2 offset = cell - float2(${floor}(cell.x), ${floor}(cell.y)) - float2(0.5, 0.5);`)
        .line(`float dist = ${imports.ref("math", "length")}(offset) * pitch;`)
        .line(`float radius = ${num(radius)} * scale;`)
        .line(`float edge = ${num(edge)} * scale;`)
        .line(`return 1.0 - ${smoothstep}(radius - edge, radius + edge, dist);`)
        .outdent()
        .line("}")
        .line();
      return;
    }

    case "line-pattern": {
      const spacing = mmToUv(fn.spacingMm);
      const half = mmToUv(fn.lineWidthMm) / 2;
      const edge = Math.max(half * EDGE_SOFTNESS, 1e-5);
      // Vertical stripes vary across x; horizontal stripes vary down y.
      const axis = fn.orientation === "vertical" ? "x" : "y";

      writer
        .comment([
          `Line frit: ${fn.lineWidthMm}mm ${fn.orientation} lines on ${fn.spacingMm}mm centres.`,
          `Coverage ${((fn.lineWidthMm / fn.spacingMm) * 100).toFixed(1)}%.`,
        ])
        .line(`export float ${fn.name}(uniform float scale = 1.0)`)
        .line("{")
        .indent()
        .line(`float pitch = ${num(spacing)} * scale;`)
        .line(`float coord = ${texCoord}.${axis} / pitch;`)
        .line(`float dist = ${imports.ref("math", "abs")}(coord - ${floor}(coord) - 0.5) * pitch;`)
        .line(`float half_width = ${num(half)} * scale;`)
        .line(`float edge = ${num(edge)} * scale;`)
        .line(`return 1.0 - ${smoothstep}(half_width - edge, half_width + edge, dist);`)
        .outdent()
        .line("}")
        .line();
      return;
    }

    case "texture-mask": {
      writer
        .comment([
          `Frit coverage from ${fn.textureFileName} (white = frit).`,
          "Keep the image file next to this .mdl file.",
        ])
        .line(`export float ${fn.name}(uniform float scale = 1.0)`)
        .line("{")
        .indent()
        .line(`return ${imports.ref("base", "file_texture")}(`)
        .indent()
        .line(
          `texture: texture_2d(${stringLiteral(`./${fn.textureFileName}`)}, ${imports.ref("tex", "gamma_linear")}),`,
        )
        .line(`mono_source: ${imports.ref("base", "mono_average")},`)
        .line(`uvw: ${imports.ref("base", "texture_coordinate_info")}(`)
        .indent()
        .line(`position: ${texCoord} / scale`)
        .outdent()
        .line(")")
        .outdent()
        .line(").mono;")
        .outdent()
        .line("}")
        .line();
      return;
    }
  }
}
