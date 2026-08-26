import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Engine boundary: src/engine is a pure TS library. It must stay importable
    // outside the browser/React (future extraction, GPU render service, CI compile
    // checks), so framework and app imports are forbidden here.
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "react/*"], message: "Engine must not depend on React." },
            { group: ["next", "next/*"], message: "Engine must not depend on Next.js." },
            { group: ["three", "three/*"], message: "Engine must not depend on three.js." },
            { group: ["zustand", "zustand/*"], message: "Engine must not depend on app state." },
            { group: ["zod", "zod/*"], message: "Engine validation is hand-rolled; zod belongs at the form boundary." },
            { group: ["@/app/*", "@/components/*", "@/lib/*"], message: "App code may import the engine; never the reverse." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
