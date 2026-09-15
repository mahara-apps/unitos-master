import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    reporters: ["verbose"],
    projects: [
      {
        extends: true,
        test: {
          name: "local",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.integration.test.ts", "tests/**/*.runtime.test.ts"],
          testTimeout: 10_000,
          hookTimeout: 10_000,
          fileParallelism: true,
        },
      },
      {
        extends: true,
        test: {
          name: "runtime",
          include: ["tests/**/*.runtime.test.ts"],
          testTimeout: 10_000,
          hookTimeout: 10_000,
          fileParallelism: true,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.integration.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
          setupFiles: ["./tests/helpers/global-teardown.ts"],
        },
      },
    ],
  },
});
