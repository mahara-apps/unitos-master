import { assertPrivilegedTestEnv } from "./test-env";

export function setup(): void {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
}