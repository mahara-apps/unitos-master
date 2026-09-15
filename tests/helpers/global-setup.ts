import { cleanupStaleTestIdentities } from "./fixtures";

export async function setup(): Promise<void> {
  await cleanupStaleTestIdentities();
}