import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    globals: false,
    // Test files share one real Postgres database and truncate tables
    // between tests (test/setup.ts) — running files in parallel would let
    // one file's truncate race another file's in-flight assertions.
    fileParallelism: false,
  },
});
