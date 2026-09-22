import { describe, expect, it } from "vitest";

import {
  attemptPresentationState,
  masterPublicationState,
  operationRuntimeState,
} from "../src/lib/installation/manager-contract";

describe("installation panel view model", () => {
  const recent = "2026-09-20T12:00:00.000Z";
  const now = Date.parse("2026-09-20T12:01:00.000Z");

  it("distingue operação ativa, retry agendado, stale e terminal", () => {
    expect(
      operationRuntimeState({ status: "running", startedAt: recent, lastReportAt: recent }, now),
    ).toBe("active");
    expect(
      operationRuntimeState({ status: "retryable", startedAt: recent, lastReportAt: recent }, now),
    ).toBe("scheduled");
    expect(
      operationRuntimeState(
        { status: "running", startedAt: "2026-09-20T11:00:00.000Z", lastReportAt: null },
        now,
      ),
    ).toBe("stale");
    expect(
      operationRuntimeState({ status: "success", startedAt: recent, lastReportAt: recent }, now),
    ).toBe("terminal");
  });

  it("mantém estado histórico desconhecido como indeterminado", () => {
    expect(attemptPresentationState("deferred")).toBe("scheduled");
    expect(attemptPresentationState("interrupted")).toBe("interrupted");
    expect(attemptPresentationState("legacy_custom_state")).toBe("indeterminate");
  });

  it("não confirma publicação sem versão e commit verificáveis", () => {
    expect(masterPublicationState(undefined)).toBe("indeterminate");
    expect(
      masterPublicationState({
        release: "1.4.23",
        commitSha: null,
        repoRelease: null,
        repoReleaseError: "sem evidência",
        masterPublished: null,
        error: null,
      }),
    ).toBe("indeterminate");
    expect(
      masterPublicationState({
        release: "1.4.23",
        commitSha: "abcdef1",
        repoRelease: "1.4.23",
        repoReleaseError: null,
        masterPublished: false,
        error: null,
      }),
    ).toBe("divergent");
    expect(
      masterPublicationState({
        release: "1.4.23",
        commitSha: "abcdef1",
        repoRelease: "1.4.23",
        repoReleaseError: null,
        masterPublished: true,
        error: null,
      }),
    ).toBe("confirmed");
  });
});
