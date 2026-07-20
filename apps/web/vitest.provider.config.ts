import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["test/provider/**/*.test.ts"],
    sequence: { concurrent: false },
    testTimeout: 45_000,
    hookTimeout: 20_000,
  },
});
