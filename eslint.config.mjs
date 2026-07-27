import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    settings: {
      // Pinned instead of "detect": eslint-plugin-react's detection path calls
      // the removed context.getFilename() and crashes on ESLint >= 10.
      react: { version: "19.2" },
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
    "**/playwright-report/**",
    "**/public/pdf.worker.min.mjs",
    "**/test-results/**",
    "work/**",
  ]),
]);
