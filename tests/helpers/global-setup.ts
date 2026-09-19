import { cleanupSharedTestUserPool, cleanupStaleTestIdentities } from "./fixtures";
import { ensureGlobalTestSchema } from "./global-schema-setup";
import { assertPrivilegedTestEnv } from "./test-env";

export async function setup(): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
  await ensureGlobalTestSchema();
  await cleanupStaleTestIdentities();
}

export async function teardown(): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
  await cleanupSharedTestUserPool();
}
