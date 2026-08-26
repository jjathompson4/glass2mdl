import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { solveSystem } from "@/engine/solve/solveSystem";
import { FIXTURES } from "./fixtures";

/**
 * Golden-file tests.
 *
 * There is no MDL compiler in this repo, so the defence against silent
 * regressions is that every change to generated output shows up as a reviewable
 * diff. Regenerate with UPDATE_GOLDEN=1 and read the diff before committing —
 * an unexpected line there is the bug report.
 */

const GOLDEN_DIR = path.join(import.meta.dirname, "__golden__");
const updating = process.env.UPDATE_GOLDEN === "1";

describe("generated MDL matches golden files", () => {
  for (const fixture of FIXTURES) {
    it(fixture.slug, () => {
      const source = solveSystem(fixture.input, fixture.mode).module.source;
      const file = path.join(GOLDEN_DIR, `${fixture.slug}.mdl`);

      if (updating) {
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(file, source);
        return;
      }

      expect(existsSync(file), `Missing golden file. Run UPDATE_GOLDEN=1 pnpm test`).toBe(true);
      expect(source).toBe(readFileSync(file, "utf8"));
    });
  }
});

describe("determinism", () => {
  it("produces byte-identical output for repeated runs", () => {
    for (const fixture of FIXTURES) {
      const first = solveSystem(fixture.input, fixture.mode).module.source;
      const second = solveSystem(fixture.input, fixture.mode).module.source;
      expect(second).toBe(first);
    }
  });
});
