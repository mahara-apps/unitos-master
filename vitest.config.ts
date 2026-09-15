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
          sequence: { groupOrder: 0 },
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
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.integration.test.ts"],
          exclude: [
            "tests/global-admin.integration.test.ts",
            "tests/portal-hardening.integration.test.ts",
            "tests/rbac.integration.test.ts",
            "tests/qa-super-admin-inventory.integration.test.ts",
            "tests/workspace-singleton.integration.test.ts",
            "tests/installation-p0-real.integration.test.ts",
          ],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
          globalSetup: ["./tests/helpers/global-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration-independent",
          include: [
            "tests/global-admin.integration.test.ts",
            "tests/portal-hardening.integration.test.ts",
            "tests/rbac.integration.test.ts",
          ],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
          globalSetup: ["./tests/helpers/global-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration-audit",
          include: [
            "tests/qa-super-admin-inventory.integration.test.ts",
            "tests/workspace-singleton.integration.test.ts",
          ],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          sequence: { groupOrder: 2 },
          globalSetup: ["./tests/helpers/global-audit-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "real-installation",
          include: ["tests/installation-p0-real.integration.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          sequence: { groupOrder: 3 },
        },
      },
    ],
  },
});
