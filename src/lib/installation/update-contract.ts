import type { InstallationOperationStatus } from "./manager-contract";

export type UpdateRecoveryDecision =
  | "resume"
  | "wait"
  | "terminal"
  | "manual_review"
  | "inconsistent";

export type UpdateOperationState = {
  installationStatus: string;
  operationStatus?: InstallationOperationStatus | null;
  automated?: boolean;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
};

/** Política única para decidir retomada sem inferir sucesso nem inventar histórico. */
export function updateRecoveryDecision(
  input: UpdateOperationState,
  nowMs: number = Date.now(),
): UpdateRecoveryDecision {
  const status = input.operationStatus ?? null;
  if (!status) return input.installationStatus === "updating" ? "inconsistent" : "terminal";
  if (status === "failed" || status === "success") return "terminal";
  if (status === "blocked" || status === "manual_review") return "manual_review";
  if (input.automated !== true) return "manual_review";

  const leaseExpiresAt = input.leaseExpiresAt ? Date.parse(input.leaseExpiresAt) : Number.NaN;
  const leaseActive = Boolean(input.leaseOwner) && Number.isFinite(leaseExpiresAt) && leaseExpiresAt > nowMs;
  if (status === "running" && leaseActive) return "wait";
  return "resume";
}

export type CanonicalUpdateEvidence = {
  targetRelease: string;
  targetCommitSha: string;
  packageSha256: string;
  totalMigrations: number;
  publishedRelease: string;
  publishedCommitSha: string;
  databaseReconciled: boolean;
  validationPassed: boolean;
};

/** Valida a identidade única usada pela finalização transacional do UPDATE. */
export function validateCanonicalUpdateEvidence(
  evidence: CanonicalUpdateEvidence,
): { ok: true } | { ok: false; reason: string } {
  if (!evidence.targetRelease.trim() || !evidence.targetCommitSha.trim()) {
    return { ok: false, reason: "release ou commit alvo ausente" };
  }
  if (!/^[0-9a-f]{64}$/i.test(evidence.packageSha256)) {
    return { ok: false, reason: "SHA-256 do pacote inválido" };
  }
  if (!Number.isInteger(evidence.totalMigrations) || evidence.totalMigrations < 1) {
    return { ok: false, reason: "total de migrations inválido" };
  }
  if (
    evidence.publishedRelease !== evidence.targetRelease ||
    evidence.publishedCommitSha.toLowerCase() !== evidence.targetCommitSha.toLowerCase()
  ) {
    return { ok: false, reason: "publicação diverge da release autorizada" };
  }
  if (!evidence.databaseReconciled || !evidence.validationPassed) {
    return { ok: false, reason: "evidência de banco ou validação incompleta" };
  }
  return { ok: true };
}