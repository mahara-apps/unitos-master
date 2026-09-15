/**
 * Teardown determinístico de identidades de QA.
 *
 * Roda mesmo quando os testes falham (afterAll do setupFile), garantindo que
 * nenhuma conta de teste — privilegiada ou não — persista após a suíte.
 */
import { afterAll, beforeAll } from "vitest";
import { assertPrivilegedTestEnv, cleanupTestIdentities } from "./fixtures";

let cleanupChain = Promise.resolve();

beforeAll(() => {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
});

afterAll(async () => {
  cleanupChain = cleanupChain.then(cleanupTestIdentities);
  await cleanupChain;
}, 120_000);
