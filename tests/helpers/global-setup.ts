import { cleanupStaleTestIdentities } from "./fixtures";
import { assertPrivilegedTestEnv } from "./test-env";

export async function setup(): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
  await cleanupStaleTestIdentities();
}

export async function teardown(): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
  await cleanupStaleTestIdentities();
}
