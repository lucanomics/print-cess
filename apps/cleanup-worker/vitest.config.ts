import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/dist/**", "**/node_modules/**"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
  },
});
