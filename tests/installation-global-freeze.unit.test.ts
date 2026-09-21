import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const freezeSql = readFileSync("supabase/master/002_control_plane_global_freeze.sql", "utf8");
const recovery = readFileSync(
  "supabase/master/recovery/20260919143000_recover_missing_legacy_reconciliation.sql",
  "utf8",
);
const preflight = readFileSync("supabase/master/recovery-control-plane-preflight.sql", "utf8");
const installPreflight = readFileSync(
  "supabase/master/global-freeze-install-preflight.sql",
  "utf8",
);
const promotion = readFileSync("supabase/master/tools/promote_master_control_plane.sh", "utf8");
const operator = readFileSync("supabase/master/tools/control_plane_freeze.sh", "utf8");
const managerFunctions = readFileSync("src/lib/installation/manager.functions.ts", "utf8");
const installationsScreen = readFileSync(
  "src/routes/_authenticated/admin.instalacoes.index.tsx",
  "utf8",
);
const freezeScript = "supabase/master/tools/control_plane_freeze.sh";

interface FreezeOptions {
  action?: "status" | "freeze" | "unfreeze";
  backup?: boolean;
  backupOperator?: string;
  authorize?: boolean;
  extraArgument?: string;
  noBackupAcceptance?: boolean;
  noBackupRisk?: string;
  failPreflight?: boolean;
}

function runFreeze(options: FreezeOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "unitos-master-freeze-"));
  const calls = join(directory, "psql-calls.txt");
  const audit = join(directory, "backup-audit.jsonl");
  const fakePsql = join(directory, "psql");
  writeFileSync(
    fakePsql,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
if [[ "$*" == *"read_installation_operations_freeze"* ]]; then
  printf '%s\\n' '{"frozen":false,"generation":7}'
elif [[ "$*" == *"frozen::text||','||generation::text"* ]]; then
  printf '%s\\n' 'false,7'
elif [[ "$*" == *"set_installation_operations_freeze"* ]]; then
  ${options.failPreflight ? "printf '%s\\n' 'ERROR: Congelamento bloqueado: existem operações ou tentativas ativas' >&2; exit 1" : ":"}
elif [[ "$*" == *"SELECT frozen::text"* ]]; then
  printf '%s\\n' 'true'
fi
`,
    { mode: 0o755 },
  );

  const args = [freezeScript, options.action ?? "freeze"];
  if (options.extraArgument) args.push(options.extraArgument);
  try {
    const stdout = execFileSync("bash", args, {
      env: {
        PATH: `${directory}:${process.env["PATH"] ?? ""}`,
        MASTER_DATABASE_URL:
          "postgresql://postgres:secret@db.tkjbhttylouamqxnbfgv.supabase.co:5432/postgres",
        MASTER_PROJECT_REF: "tkjbhttylouamqxnbfgv",
        UNITOS_MASTER_FREEZE:
          options.authorize === false ? "" : "I_UNDERSTAND_GLOBAL_CONTROL_PLANE_FREEZE",
        UNITOS_FREEZE_REASON: "Janela controlada de manutenção",
        UNITOS_FREEZE_ACTOR: "operador-control-plane",
        UNITOS_MASTER_BACKUP_CONFIRMATION: options.backup ? "BACKUP_RESTORABLE_VERIFIED" : "",
        UNITOS_MASTER_BACKUP_EVIDENCE: options.backup ? "snapshot-master-freeze-test" : "",
        UNITOS_MASTER_BACKUP_OPERATOR: options.backup
          ? (options.backupOperator ?? "operador-control-plane")
          : "",
        UNITOS_MASTER_BACKUP_AUDIT_FILE: audit,
        UNITOS_MASTER_NO_BACKUP_CONFIRMATION: options.noBackupAcceptance
          ? "ACCEPT_EXISTING_CONTROL_PLANE_WITHOUT_RESTORABLE_BACKUP"
          : "",
        UNITOS_MASTER_NO_BACKUP_PROJECT_REF: options.noBackupAcceptance
          ? "tkjbhttylouamqxnbfgv"
          : "",
        UNITOS_MASTER_NO_BACKUP_OPERATOR: options.noBackupAcceptance
          ? "operador-control-plane"
          : "",
        UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED: options.noBackupAcceptance
          ? (options.noBackupRisk ??
            "Aceito o risco global de operar sem backup restaurável confirmado.")
          : "",
      },
      encoding: "utf8",
    });
    return {
      code: 0,
      output: stdout,
      calls: existsSync(calls) ? readFileSync(calls, "utf8") : "",
      audit: existsSync(audit) ? readFileSync(audit, "utf8") : "",
    };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: failure.status ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      calls: existsSync(calls) ? readFileSync(calls, "utf8") : "",
      audit: existsSync(audit) ? readFileSync(audit, "utf8") : "",
    };
  }
}

describe("congelamento global fail-closed do Control-plane", () => {
  it("mantém estado singleton e histórico auditável com grants antes do RLS", () => {
    expect(freezeSql).toContain(
      "CREATE TABLE IF NOT EXISTS public.installation_operations_freeze (",
    );
    expect(freezeSql).toContain("PRIMARY KEY DEFAULT true CHECK (singleton)");
    expect(freezeSql).toContain(
      "CREATE TABLE IF NOT EXISTS public.installation_operations_freeze_events (",
    );
    expect(freezeSql.indexOf("GRANT SELECT ON public.installation_operations_freeze")).toBeLessThan(
      freezeSql.indexOf(
        "ALTER TABLE public.installation_operations_freeze ENABLE ROW LEVEL SECURITY",
      ),
    );
    expect(freezeSql).toContain("installation_operations_freeze_super_admin_read");
    expect(freezeSql).toContain("installation_operations_freeze_events_super_admin_read");
  });

  it("serializa mudança e mutações com a mesma advisory lock", () => {
    expect(
      freezeSql.match(/hashtextextended\('unitos:master:installation-operations-freeze',0\)/g),
    ).toHaveLength(2);
    expect(freezeSql).toContain("FOR UPDATE");
    expect(freezeSql).toContain("_current.generation <> _expected_generation");
    expect(freezeSql).toContain("status IN ('running','retryable')");
    expect(freezeSql).not.toContain(
      "EXISTS (SELECT 1 FROM public.installation_operations WHERE status IN ('pending','running','retryable'))",
    );
    expect(freezeSql).toContain("a.status = 'running'");
    expect(freezeSql).toContain("a.status IN ('retryable','deferred','interrupted')");
    expect(freezeSql).toContain("o.status IN ('blocked','manual_review','success','failed')");
    expect(freezeSql).toContain("lease_owner IS NOT NULL OR lease_expires_at IS NOT NULL");
  });

  it("classifica histórico terminal sem esconder atividade ou ambiguidade", () => {
    expect(installPreflight).toContain("historical_terminal");
    expect(installPreflight).toContain(
      "o.status IN ('blocked', 'manual_review', 'success', 'failed')",
    );
    expect(installPreflight).toContain("active_or_concurrent = 0");
    expect(installPreflight).toContain("a.status = 'running'");
    expect(installPreflight).toContain("a.status IN ('retryable','deferred','interrupted')");
    expect(installPreflight).toContain("status IS NULL OR status NOT IN");
    expect(installPreflight).toContain("orphaned = 0");
    expect(installPreflight).toContain("unknown_status = 0");
    expect(installPreflight).toContain("lease_expires_at<=now()");
    expect(installPreflight).toContain("'deferred','interrupted'");
    expect(installPreflight).not.toMatch(/SELECT 4[^\n]+true/);
    expect(installPreflight).not.toMatch(/SELECT 8[^\n]+true/);
    expect(installPreflight).not.toMatch(/UPDATE|DELETE|INSERT|ALTER|CREATE|DROP/);
  });

  it("bloqueia fail-closed todas as tabelas operacionais inclusive service_role", () => {
    for (const table of [
      "installations",
      "installation_credentials",
      "installation_operations",
      "installation_operation_attempts",
      "installation_operation_steps",
      "installation_operation_outbox",
      "installation_operation_migrations",
      "installation_migration_reconciliation_evidence",
    ]) {
      expect(freezeSql).toContain(`'${table}'`);
    }
    expect(freezeSql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
    expect(freezeSql).toContain("SELECT frozen INTO STRICT _frozen");
    expect(freezeSql).toContain("Estado do congelamento ausente ou inválido; mutação bloqueada");
  });

  it("restringe a escrita do estado às RPCs privilegiadas", () => {
    expect(freezeSql).toContain(
      "REVOKE ALL ON FUNCTION public.set_installation_operations_freeze(boolean,text,text,bigint)",
    );
    expect(freezeSql).toContain("TO service_role");
    expect(freezeSql).toContain(
      "GRANT SELECT ON public.installation_operations_freeze TO service_role",
    );
    expect(freezeSql).not.toContain(
      "GRANT ALL ON public.installation_operations_freeze TO service_role",
    );
  });

  it("obriga preflight e recovery a confirmarem freeze ativo", () => {
    expect(preflight).toContain("congelamento global instalado e ativo");
    expect(preflight).toContain("freeze_active");
    expect(recovery).toContain("congelamento global não está ativo");
    expect(recovery).toContain("unitos:master:installation-operations-freeze");
    expect(recovery).toContain("installation_operations_freeze_guard");
  });

  it("separa instalação, ativação e desativação da recovery e do UPDATE", () => {
    expect(promotion).toContain("--install-global-freeze");
    expect(promotion).toContain("INSTALL_GLOBAL_FREEZE_ONLY");
    expect(promotion).toContain("--install-deterministic-update");
    expect(promotion).toContain("INSTALL_DETERMINISTIC_UPDATE_ONLY");
    expect(operator).toContain("status|freeze|unfreeze");
    expect(operator).toContain("I_UNDERSTAND_GLOBAL_CONTROL_PLANE_FREEZE");
    expect(operator).toContain("UNITOS_FREEZE_REASON");
    expect(operator).toContain("UNITOS_FREEZE_ACTOR");
    expect(operator).not.toContain("recover-missing-1.4.10");
    expect(operator).not.toContain("UPDATE");
  });

  it("bloqueia freeze sem backup nem aceitação global antes de consultar ou escrever estado", () => {
    const result = runFreeze();
    expect(result.code).toBe(2);
    expect(result.output).toContain("backup restaurável ou aceite explicitamente");
    expect(result.calls).toBe("");
    expect(result.audit).toBe("");
  });

  it("aceita backup válido, registra JSONL e preserva geração fenced", () => {
    const result = runFreeze({ backup: true });
    expect(result.code).toBe(0);
    expect(result.output).toContain("Congelamento global confirmado: freeze");
    expect(result.audit).toContain('"decision": "backup_verified"');
    expect(result.audit).toContain('"scope": "global"');
    expect(result.audit).not.toContain("postgresql://");
    expect(result.calls).toContain("frozen::text||','||generation::text");
    expect(result.calls).toContain("--set generation=7");
    expect(result.calls).toContain("set_installation_operations_freeze");
  });

  it("aceita risco global sem backup sem enfraquecer geração e fencing", () => {
    const result = runFreeze({ noBackupAcceptance: true });
    expect(result.code).toBe(0);
    expect(result.output).toContain("Congelamento global confirmado: freeze");
    expect(result.audit).toContain('"decision": "global_no_backup_accepted"');
    expect(result.audit).toContain('"scope": "global"');
    expect(result.calls).toContain("--set generation=7");
    expect(result.calls).toContain("set_installation_operations_freeze");
  });

  it("bloqueia operador de backup ausente e aceitação global incompleta", () => {
    const missingOperator = runFreeze({ backup: true, backupOperator: "" });
    expect(missingOperator.code).toBe(2);
    expect(missingOperator.output).toContain("UNITOS_MASTER_BACKUP_OPERATOR ausente");
    expect(missingOperator.calls).toBe("");

    const missingRisk = runFreeze({ noBackupAcceptance: true, noBackupRisk: "" });
    expect(missingRisk.code).toBe(2);
    expect(missingRisk.output).toContain("UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED ausente");
    expect(missingRisk.calls).toBe("");
  });

  it("mantém autorização própria e bloqueia argumentos adicionais", () => {
    const unauthorized = runFreeze({ backup: true, authorize: false });
    expect(unauthorized.code).toBe(2);
    expect(unauthorized.output).toContain("alteração exige UNITOS_MASTER_FREEZE");
    expect(unauthorized.calls).toBe("");

    const extraArgument = runFreeze({ backup: true, extraArgument: "*" });
    expect(extraArgument.code).toBe(2);
    expect(extraArgument.output).toContain("status|freeze|unfreeze");
    expect(extraArgument.calls).toBe("");
  });

  it("propaga o bloqueio atômico de preflight sem confirmar estado final", () => {
    const result = runFreeze({ backup: true, failPreflight: true });
    expect(result.code).toBe(1);
    expect(result.output).toContain("existem operações ou tentativas ativas");
    expect(result.calls).toContain("--set generation=7");
    expect(result.calls).not.toContain("SELECT frozen::text FROM");
  });

  it("mantém status somente leitura sem exigir gate de backup", () => {
    const result = runFreeze({ action: "status", authorize: false });
    expect(result.code).toBe(0);
    expect(result.output).toContain('"generation":7');
    expect(result.calls).toContain("read_installation_operations_freeze");
    expect(result.audit).toBe("");
  });

  it("mantém a compatibilidade restrita à listagem somente leitura", () => {
    const listStart = managerFunctions.indexOf("export const listInstallationsFn");
    const listEnd = managerFunctions.indexOf("const UpsertInput", listStart);
    const listBlock = managerFunctions.slice(listStart, listEnd);
    expect(listBlock).toContain("readInstallationOperationsFreezeForListing");
    expect(listBlock).toContain('freeze.status === "inactive"');
    expect(listBlock.indexOf('from("installations")')).toBeGreaterThan(
      listBlock.indexOf("readInstallationOperationsFreezeForListing"),
    );
    expect(installationsScreen).toContain("list.isError");
    expect(installationsScreen).toContain("Não foi possível carregar as instalações");
  });
});
