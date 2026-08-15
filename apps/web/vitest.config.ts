import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "test/e2e/**", "test/provider/**"],
    coverage: {
      include: ["src/server/**/*.ts", "src/lib/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    /**
     * The development blob transport stores ciphertext under one directory
     * derived from the working directory, and wipes it on construction so that
     * ciphertext from a previous process is unreachable. That is the right
     * behaviour for a development adapter and it makes two suites that build a
     * runtime at the same time delete each other's parts: whichever constructs
     * second removes the first one's blobs mid-test, and the failure lands on
     * whichever file happened to lose the race.
     *
     * Running one file at a time removes the overlap without weakening the
     * adapter. The whole suite is a few seconds either way.
     */
    fileParallelism: false,
  },
});
