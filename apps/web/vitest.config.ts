import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "test/e2e/**"],
    coverage: {
      include: ["src/server/**/*.ts", "src/lib/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    setupFiles: ["./test/setup.ts"],
  },
});
