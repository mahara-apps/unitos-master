import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = "supabase/master/tools/promote_master_control_plane.sh";
const STAGE_CHECK = "supabase/master/tools/verify_master_recovery_stage.py";
const validDryRun = [
  "DRY RUN: migrations will *not* be pushed to the database.",
  "Would push migration 20260919143000_recover_missing_legacy_reconciliation.sql...",
  "Finished supabase db push.",
].join("\n");
const passingPreflight = Array.from(
  { length: 17 },
  (_, index) => `${index + 1},preflight,ok,PASS`,
).join("\n");

interface PromotionOptions {
  recoveryConfirmation?: string;
  projectRef?: string;
  preflight?: string;
  preflightError?: string;
  remoteVersions?: string;
  ledgerState?: string;
  dryRun?: string;
  cliVersion?: string;
  mutateStageAfterDryRun?: "config" | "duplicate" | "historical" | "recovery";
  concurrentLedger?: string;
  concurrentLedgerAtRead?: number;
  omitBackupEvidence?: boolean;
  deterministicUpdateConfirmation?: string;
}

function runPromotion(
  mode:
    | "--converge-existing"
    | "--bootstrap-clean"
    | "--install-deterministic-update"
    | "--recover-missing-1.4.10",
  verification: string,
  options: PromotionOptions = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "unitos-master-promotion-"));
  const calls = join(directory, "calls.txt");
  const fakePsql = join(directory, "psql");
  const fakeSupabase = join(directory, "supabase");
  const ledgerReads = join(directory, "ledger-reads.txt");
  writeFileSync(
    fakePsql,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
if [[ "$*" == *"recovery-control-plane-preflight.sql"* ]]; then
  ${options.preflightError ? `printf '%s\\n' '${options.preflightError}' >&2; exit 1` : ""}
  printf '%s\\n' '${options.preflight ?? passingPreflight}'
elif [[ "$*" == *"deterministic-update-install-preflight.sql"* ]]; then
  printf '%s\\n' '${options.preflight ?? "1,preflight,ok,PASS"}'
elif [[ "$*" == *"verify-installation-master.sql"* ]]; then
  printf '%s\\n' '${verification}'
elif [[ "$*" == *"SELECT concat_ws"* ]]; then
  printf '%s\\n' '${options.ledgerState ?? "0,1,1"}'
elif [[ "$*" == *"SELECT version FROM"* ]]; then
  count=0
  [[ -f "${ledgerReads}" ]] && count="$(cat "${ledgerReads}")"
  count=$((count + 1))
  printf '%s' "$count" > "${ledgerReads}"
  if [[ "$count" -ge '${options.concurrentLedgerAtRead ?? 2}' && -n '${options.concurrentLedger ?? ""}' ]]; then
    printf '%s\\n' '${options.concurrentLedger ?? ""}'
  else
    printf '%s\\n' '${options.remoteVersions ?? "20260917190721"}'
  fi
fi
`,
    { mode: 0o755 },
  );
  writeFileSync(
    fakeSupabase,
    `#!/usr/bin/env bash
printf 'supabase %s\\n' "$*" >> "${calls}"
if [[ "$*" == "--version" ]]; then
  printf '%s\\n' '${options.cliVersion ?? "2.117.0"}'
  exit 0
fi
if [[ "$*" == *"--dry-run"* ]]; then
  printf '%s\\n' '${options.dryRun ?? validDryRun}'
  ${
    options.mutateStageAfterDryRun
      ? `while [[ "$#" -gt 0 ]]; do
    if [[ "$1" == "--workdir" ]]; then
      case '${options.mutateStageAfterDryRun}' in
        config) printf '\\n# altered\\n' >> "$2/supabase/config.toml" ;;
        duplicate) cp "$2/supabase/migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql" "$2/supabase/migrations/20260917190721_duplicate.sql" ;;
        historical) printf '\\n-- altered\\n' >> "$2/supabase/migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql" ;;
        recovery) printf '\\n-- altered\\n' >> "$2/supabase/migrations/20260919143000_recover_missing_legacy_reconciliation.sql" ;;
      esac
      break
    fi
    shift
  done`
      : ""
  }
fi
`,
    { mode: 0o755 },
  );

  try {
    const stdout = execFileSync("bash", [SCRIPT, mode], {
      env: {
        PATH: `${directory}:${process.env["PATH"] ?? ""}`,
        UNITOS_MASTER_PROMOTION: "I_UNDERSTAND_MASTER_ONLY",
        MASTER_DATABASE_URL:
          "postgresql://postgres:secret@db.tkjbhttylouamqxnbfgv.supabase.co:5432/postgres",
        UNITOS_MASTER_RECOVERY: options.recoveryConfirmation ?? "",
        UNITOS_MASTER_DETERMINISTIC_UPDATE_INSTALL: options.deterministicUpdateConfirmation ?? "",
        MASTER_PROJECT_REF: options.projectRef ?? "",
        UNITOS_SUPABASE_CLI: fakeSupabase,
        UNITOS_MASTER_BACKUP_CONFIRMATION: options.omitBackupEvidence
          ? ""
          : "BACKUP_RESTORABLE_VERIFIED",
        UNITOS_MASTER_BACKUP_EVIDENCE: options.omitBackupEvidence ? "" : "snapshot-master-test",
        UNITOS_MASTER_BACKUP_OPERATOR: options.omitBackupEvidence ? "" : "test-operator",
        UNITOS_MASTER_BACKUP_AUDIT_FILE: join(directory, "backup-audit.jsonl"),
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    return { code: 0, stdout, calls: readFileSync(calls, "utf8") };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: failure.status ?? 1,
      stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      calls: existsSync(calls) ? readFileSync(calls, "utf8") : "",
    };
  }
}

const recoveryOptions: PromotionOptions = {
  recoveryConfirmation: "RECOVER_MISSING_1_4_10_ONLY",
  projectRef: "tkjbhttylouamqxnbfgv",
};

describe("promoção local do Control-plane Master", () => {
  it("instala somente o executor determinístico após backup, identidade, autorização e preflight", () => {
    const result = runPromotion("--install-deterministic-update", "1,controle,ok,PASS", {
      projectRef: "tkjbhttylouamqxnbfgv",
      deterministicUpdateConfirmation: "INSTALL_DETERMINISTIC_UPDATE_ONLY",
      preflight: Array.from({ length: 5 }, (_, index) => `${index + 1},preflight,ok,PASS`).join(
        "\n",
      ),
    });
    expect(result.code).toBe(0);
    expect(result.calls).toContain("deterministic-update-install-preflight.sql");
    expect(result.calls).toContain("install-deterministic-update.sql");
    expect(result.calls).toContain("--single-transaction");
    expect(result.calls).not.toContain("002_control_plane_global_freeze.sql");
    expect(result.calls).not.toContain("recovery-control-plane-preflight.sql");
  });

  it("bloqueia instalação determinística sem autorização ou com preflight incompleto", () => {
    const unauthorized = runPromotion("--install-deterministic-update", "1,controle,ok,PASS", {
      projectRef: "tkjbhttylouamqxnbfgv",
    });
    expect(unauthorized.code).toBe(2);
    expect(unauthorized.calls).toBe("");
    const incomplete = runPromotion("--install-deterministic-update", "1,controle,ok,PASS", {
      projectRef: "tkjbhttylouamqxnbfgv",
      deterministicUpdateConfirmation: "INSTALL_DETERMINISTIC_UPDATE_ONLY",
      preflight: "1,preflight,ok,PASS",
    });
    expect(incomplete.code).toBe(1);
    expect(incomplete.stdout).toContain("preflight do executor determinístico");
    expect(incomplete.calls).not.toContain("install-deterministic-update.sql");
  });

  it("bloqueia qualquer escrita sem evidência de backup ou exceção válida", () => {
    const result = runPromotion("--converge-existing", "1,controle,ok,PASS", {
      omitBackupEvidence: true,
    });
    expect(result.code).toBe(2);
    expect(result.stdout).toContain("backup restaurável obrigatório");
    expect(result.calls).toBe("");
  });

  it("Master existente aplica apenas a convergência em transação e verifica", () => {
    const result = runPromotion("--converge-existing", "1,controle,ok,PASS");
    expect(result.code).toBe(0);
    expect(result.calls).toContain("--single-transaction");
    expect(result.calls).toContain("convergence-control-plane.sql");
    expect(result.calls).not.toContain(
      "--file /dev-server/supabase/master/bootstrap-control-plane.sql",
    );
    expect(result.calls).toContain("verify-installation-master.sql");
  });

  it("Master limpo aplica o bootstrap completo em transação", () => {
    const result = runPromotion("--bootstrap-clean", "1,controle,ok,PASS");
    expect(result.code).toBe(0);
    expect(result.calls).toContain("--single-transaction");
    expect(result.calls).toContain("bootstrap-control-plane.sql");
    expect(result.calls).toContain("verify-installation-master.sql");
  });

  it("falha a promoção quando o verificador Master encontra FAIL", () => {
    const result = runPromotion("--converge-existing", "1,controle,divergente,FAIL");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("verificador Master encontrou divergências");
  });

  it("bloqueia recuperação sem confirmação e identidade específicas", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS");
    expect(result.code).toBe(2);
    expect(result.calls).toBe("");
  });

  it("recupera somente o artefato dedicado após preflight e verifica", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      preflight: passingPreflight,
    });
    expect(result.code).toBe(0);
    expect(result.calls).toContain("recovery-control-plane-preflight.sql");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(2);
    expect(result.calls).toContain("--dry-run");
    expect(result.calls).toContain("supabase --version");
    expect(result.calls).toContain("verify-installation-master.sql");
    expect(result.calls).not.toContain("convergence-control-plane.sql");
    expect(result.calls).not.toContain("bootstrap-control-plane.sql");
  });

  it("bloqueia quando o executor oficial seleciona qualquer outra migration", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      dryRun: validDryRun.replace(
        "20260919143000_recover_missing_legacy_reconciliation.sql",
        "20260920120000_other.sql",
      ),
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("não selecionou exclusivamente 20260919143000");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("não aplica recuperação quando o preflight falha", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      preflight: "1,preflight,divergente,FAIL",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("preflight da recuperação encontrou divergências");
    expect(result.calls).not.toContain("supabase db push");
  });

  it("bloqueia seleção da migration histórica 1.4.10", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      dryRun: validDryRun.replace(
        "20260919143000_recover_missing_legacy_reconciliation.sql",
        "20260917184500_legacy_migration_reconciliation.sql",
      ),
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("não selecionou exclusivamente 20260919143000");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia reaplicação da migration histórica 1.4.11", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      dryRun: validDryRun.replace(
        "20260919143000_recover_missing_legacy_reconciliation.sql",
        "20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql",
      ),
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("não selecionou exclusivamente 20260919143000");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia ledger remoto contendo a 1.4.10", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      remoteVersions: "20260917184500\n20260917190721",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("ledger remoto contradiz a fila exclusiva de recuperação");
    expect(result.calls).not.toContain("supabase db push");
  });

  it("bloqueia ledger remoto contendo a própria recovery", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      remoteVersions: "20260917190721\n20260919143000",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("ledger remoto contradiz a fila exclusiva de recuperação");
    expect(result.calls).not.toContain("supabase db push");
  });

  it("bloqueia saída incompleta do preflight", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      preflight: Array.from({ length: 16 }, (_, index) => `${index + 1},preflight,ok,PASS`).join(
        "\n",
      ),
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("preflight da recuperação encontrou divergências");
    expect(result.calls).not.toContain("supabase db push");
  });

  it("propaga o erro real da pseudo-role PUBLIC e não chega ao executor", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      preflightError: 'ERROR: role "public" does not exist',
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('role "public" does not exist');
    expect(result.calls).not.toContain("supabase db push");
  });

  it("bloqueia dry-run que menciona migration histórica proibida", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      dryRun: `${validDryRun}\nremote ledger mentions 20260917184500`,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("executor tentou selecionar 1.4.10 ou reaplicar 1.4.11");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia alteração do staging entre dry-run e execução", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      mutateStageAfterDryRun: "config",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("staging foi alterado entre o selo e a execução");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
    expect(result.calls).not.toContain("SELECT concat_ws");
  });

  it("bloqueia versão diferente da Supabase CLI fixada", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      cliVersion: "2.116.0",
    });
    expect(result.code).toBe(2);
    expect(result.stdout).toContain("Supabase CLI deve ser exatamente 2.117.0");
    expect(result.calls).not.toContain("--dry-run");
  });

  it("bloqueia dry-run sem o contrato textual completo da CLI fixada", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      dryRun: "Would push migration 20260919143000_recover_missing_legacy_reconciliation.sql...",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("formato do dry-run diverge");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia arquivos duplicados por versão no staging", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      mutateStageAfterDryRun: "duplicate",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("arquivos duplicados para a versão 20260917190721");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia hash divergente de migration histórica no staging", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      mutateStageAfterDryRun: "historical",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("hash da migration histórica");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia divergência entre manifesto, fonte e recovery no staging", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      mutateStageAfterDryRun: "recovery",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "manifesto, arquivo-fonte e staging da recovery estão divergentes",
    );
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia alteração concorrente do ledger após o dry-run", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      concurrentLedger: "20260917190721\n20260919120000",
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("ledger foi alterado concorrentemente após o dry-run");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia alteração concorrente do ledger imediatamente antes da execução", () => {
    const result = runPromotion("--recover-missing-1.4.10", "1,controle,ok,PASS", {
      ...recoveryOptions,
      concurrentLedger: "20260917190721\n20260919120000",
      concurrentLedgerAtRead: 3,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("ledger foi alterado concorrentemente antes da execução");
    expect(result.calls.match(/supabase db push/g)).toHaveLength(1);
  });

  it("bloqueia manifesto divergente do arquivo-fonte antes do staging", () => {
    const root = mkdtempSync(join(tmpdir(), "unitos-recovery-manifest-"));
    mkdirSync(join(root, "master", "recovery"), { recursive: true });
    mkdirSync(join(root, "migrations"), { recursive: true });
    cpSync(
      "supabase/master/recovery-control-plane.json",
      join(root, "master", "recovery-control-plane.json"),
    );
    cpSync(
      "supabase/master/recovery-control-plane-preflight.sql",
      join(root, "master", "recovery-control-plane-preflight.sql"),
    );
    cpSync(
      "supabase/master/recovery/20260919143000_recover_missing_legacy_reconciliation.sql",
      join(root, "master", "recovery", "20260919143000_recover_missing_legacy_reconciliation.sql"),
    );
    cpSync(
      "supabase/migrations/20260917184500_legacy_migration_reconciliation.sql",
      join(root, "migrations", "20260917184500_legacy_migration_reconciliation.sql"),
    );
    cpSync(
      "supabase/migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql",
      join(root, "migrations", "20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql"),
    );
    writeFileSync(
      join(root, "master", "recovery", "20260919143000_recover_missing_legacy_reconciliation.sql"),
      "-- divergent\n",
    );
    expect(() => execFileSync("python3", [STAGE_CHECK, "--root", root])).toThrow(
      /manifesto diverge do arquivo-fonte/,
    );
  });
});
