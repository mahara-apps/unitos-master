import { cleanupSharedTestUserPool, cleanupStaleTestIdentities } from "./fixtures";
import { assertPrivilegedTestEnv } from "./test-env";

export async function setup(): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
  await cleanupSharedTestUserPool();
  await cleanupStaleTestIdentities();
}
