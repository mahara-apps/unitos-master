export type LegacyEvidenceClassification =
  | "canonical_state"
  | "partial_compatibility"
  | "external_checkpoint_required";
export type LegacyEvidenceStatus = "compatible" | "divergent" | "insufficient";
export type LegacyEvidenceResult = {
  position: number;
  migration_file: string;
  classification: LegacyEvidenceClassification;
  evidence_key: string;
  status: LegacyEvidenceStatus;
  observed: string;
};

type Migration = { file: string; sql: string; fingerprint: string };
const CONTRACT = [
  [21, "partial_compatibility"], [34, "canonical_state"], [39, "canonical_state"],
  [42, "partial_compatibility"], [52, "partial_compatibility"], [55, "canonical_state"],
  [56, "partial_compatibility"], [61, "canonical_state"], [64, "canonical_state"],
  [66, "partial_compatibility"], [70, "canonical_state"], [71, "canonical_state"],
  [72, "external_checkpoint_required"], [74, "external_checkpoint_required"],
  [82, "partial_compatibility"], [83, "partial_compatibility"], [84, "canonical_state"],
  [85, "external_checkpoint_required"],
] as const satisfies readonly (readonly [number, LegacyEvidenceClassification])[];

export const LEGACY_RECONCILIATION_POSITIONS = CONTRACT.map(([position]) => position);
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const normalizeBody = (value: string) => value.replace(/\s+/g, "").toLowerCase();

function finalFunctionBody(packageSql: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${escaped}\\s*\\([^)]*\\)[\\s\\S]*?\\bas\\s+\\$([A-Za-z0-9_]*)\\$([\\s\\S]*?)\\$\\1\\$\\s*;`,
    "gi",
  );
  const body = [...packageSql.matchAll(pattern)].at(-1)?.[2];
  if (!body) throw new Error(`Definição canônica ausente para public.${name}`);
  return normalizeBody(body);
}

function functionCondition(input: {
  packageSql: string;
  signature: string;
  name: string;
  serviceRole?: boolean;
  securityDefiner?: boolean;
}): string {
  const oid = `to_regprocedure(${literal(`public.${input.signature}`)})`;
  const clauses = [
    `${oid} IS NOT NULL`,
    `(SELECT regexp_replace(lower(prosrc), '\\s+', '', 'g') = ${literal(finalFunctionBody(input.packageSql, input.name))} FROM pg_proc WHERE oid=${oid})`,
    `NOT has_function_privilege('PUBLIC', ${oid}, 'EXECUTE')`,
    `NOT has_function_privilege('anon', ${oid}, 'EXECUTE')`,
    `NOT has_function_privilege('authenticated', ${oid}, 'EXECUTE')`,
  ];
  if (input.serviceRole) clauses.push(`has_function_privilege('service_role', ${oid}, 'EXECUTE')`);
  if (input.securityDefiner !== undefined) {
    clauses.push(`(SELECT prosecdef = ${input.securityDefiner ? "true" : "false"} FROM pg_proc WHERE oid=${oid})`);
  }
  return clauses.join(" AND ");
}

function resultSelect(migration: Migration, position: number, classification: LegacyEvidenceClassification, condition: string | null): string {
  const evidenceKey = `${position}:${migration.file}:${classification}`;
  const status = condition ? `CASE WHEN (${condition}) THEN 'compatible' ELSE 'divergent' END` : `'insufficient'`;
  const observed = condition ? `CASE WHEN (${condition}) THEN 'pós-condição canônica confirmada' ELSE 'pós-condição ausente ou divergente' END` : `'checkpoint externo canônico ausente'`;
  return `SELECT ${position}::integer AS position, ${literal(migration.file)}::text AS migration_file, ${literal(classification)}::text AS classification, ${literal(evidenceKey)}::text AS evidence_key, ${status}::text AS status, ${observed}::text AS observed`;
}

/** Inspeção única, SELECT-only, com chave exclusiva por migration. */
export function buildLegacyReconciliationInspectionSql(migrations: Migration[]): string {
  if (migrations.length !== 85) throw new Error("Reconciliação exige o pacote Client canônico de 85 blocos.");
  const packageSql = migrations.map((item) => item.sql).join("\n");
  const migrationAt = (position: number) => {
    const migration = migrations[position - 1];
    if (!migration) throw new Error(`Migration canônica ausente na posição ${position}.`);
    return migration;
  };
  const fn = (signature: string, name: string, options?: { serviceRole?: boolean; securityDefiner?: boolean }) =>
    functionCondition({ packageSql, signature, name, ...options });
  const noPublic = (signature: string, name: string) => fn(signature, name);
  const serviceOnly = (signature: string, name: string, securityDefiner?: boolean) =>
    fn(signature, name, { serviceRole: true, ...(securityDefiner === undefined ? {} : { securityDefiner }) });
  const dangerousAcl = `NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relowner='postgres'::regrole AND a.grantee='anon'::regrole AND a.privilege_type IN ('MAINTAIN','TRUNCATE','TRIGGER','REFERENCES'))`;
  const defaultAcl = `NOT EXISTS (SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='r' AND a.grantee='anon'::regrole AND a.privilege_type IN ('MAINTAIN','TRUNCATE','TRIGGER','REFERENCES'))`;
  const conditions = new Map<number, string | null>([
    [21, noPublic("enforce_single_brand()", "enforce_single_brand")],
    [34, `${noPublic("block_portal_client_team_link()", "block_portal_client_team_link")} AND ${noPublic("enforce_portal_client_exclusivity()", "enforce_portal_client_exclusivity")}`],
    [39, noPublic("guard_client_policy_authority()", "guard_client_policy_authority")],
    [42, serviceOnly("bump_message_thread()", "bump_message_thread")],
    [52, `EXISTS (SELECT 1 FROM public.feature_catalog WHERE key='messages' AND name='Mensagens' AND description='Central de mensagens entre time, clientes e portal.' AND category='Gestão' AND icon='MessagesSquare' AND default_enabled AND is_available AND sort_order=105) AND NOT EXISTS (SELECT 1 FROM public.brands b WHERE NOT EXISTS (SELECT 1 FROM public.brand_features f WHERE f.brand_id=b.id AND f.feature_key='messages' AND f.enabled))`],
    [55, `${serviceOnly("post_copy_queue_drain_on()", "post_copy_queue_drain_on")} AND ${serviceOnly("post_copy_queue_drain_off()", "post_copy_queue_drain_off")} AND ${noPublic("post_copy_queue_notify()", "post_copy_queue_notify")}`],
    [56, `EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='posts')`],
    [61, serviceOnly("protect_pipeline_delete()", "protect_pipeline_delete")],
    [64, fn("can_manage_client_automations(uuid,uuid,uuid)", "can_manage_client_automations", { securityDefiner: false })],
    [66, fn("set_client_default_whatsapp_recipient(uuid,uuid,uuid)", "set_client_default_whatsapp_recipient", { securityDefiner: false })],
    [70, `${serviceOnly("clean_mention_tokens(text)", "clean_mention_tokens")} AND ${serviceOnly("sanitize_mention_body()", "sanitize_mention_body")} AND ${serviceOnly("bump_message_thread()", "bump_message_thread")}`],
    [71, `EXISTS (SELECT 1 FROM pg_enum blocked JOIN pg_type t ON t.oid=blocked.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum done ON done.enumtypid=blocked.enumtypid WHERE n.nspname='public' AND t.typname='task_status' AND blocked.enumlabel='blocked' AND done.enumlabel='done' AND blocked.enumsortorder<done.enumsortorder AND NOT EXISTS (SELECT 1 FROM pg_enum middle WHERE middle.enumtypid=blocked.enumtypid AND middle.enumsortorder>blocked.enumsortorder AND middle.enumsortorder<done.enumsortorder))`],
    [72, null],
    [74, `${serviceOnly("assign_project_job_number()", "assign_project_job_number")} AND ${serviceOnly("prevent_project_job_number_change()", "prevent_project_job_number_change")} AND ${serviceOnly("log_project_job_activity()", "log_project_job_activity")} AND ${serviceOnly("log_task_activity()", "log_task_activity")} AND ${serviceOnly("log_work_timer_stop()", "log_work_timer_stop")} AND ${serviceOnly("start_job_timer(uuid,uuid)", "start_job_timer", true)}`],
    [82, serviceOnly("seed_default_work_statuses_for_brand()", "seed_default_work_statuses_for_brand")],
    [83, `NOT EXISTS (SELECT 1 FROM (VALUES ('evolution_events'),('evolution_instances'),('installation'),('whatsapp_recipients')) v(name) CROSS JOIN LATERAL unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) p(privilege) WHERE has_table_privilege('anon',format('public.%I',v.name),p.privilege)) AND ${defaultAcl} AND has_schema_privilege('anon','public','USAGE')`],
    [84, `${dangerousAcl} AND ${defaultAcl} AND has_schema_privilege('anon','public','USAGE') AND has_table_privilege('anon','public.installation','SELECT')`],
    [85, null],
  ]);
  return `${CONTRACT.map(([position, classification]) => resultSelect(migrationAt(position), position, classification, conditions.get(position) ?? null)).join("\nUNION ALL\n")}\nORDER BY position`;
}

export function normalizeLegacyEvidenceRows(rows: unknown[]): LegacyEvidenceResult[] {
  const results: LegacyEvidenceResult[] = [];
  const seenPositions = new Set<number>();
  const seenEvidence = new Set<string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") throw new Error("Resposta de reconciliação contém linha inválida.");
    const row = raw as Record<string, unknown>;
    const position = Number(row["position"]);
    const expected = CONTRACT.find(([item]) => item === position);
    const classification = String(row["classification"] ?? "") as LegacyEvidenceClassification;
    const status = String(row["status"] ?? "") as LegacyEvidenceStatus;
    const evidenceKey = String(row["evidence_key"] ?? "");
    if (!expected || seenPositions.has(position) || classification !== expected[1] || !["compatible", "divergent", "insufficient"].includes(status) || !evidenceKey || seenEvidence.has(evidenceKey)) {
      throw new Error("Resposta de reconciliação diverge do contrato canônico de evidências.");
    }
    seenPositions.add(position);
    seenEvidence.add(evidenceKey);
    results.push({ position, migration_file: String(row["migration_file"] ?? ""), classification, evidence_key: evidenceKey, status, observed: String(row["observed"] ?? "") });
  }
  if (results.length !== CONTRACT.length) throw new Error("Resposta de reconciliação está incompleta.");
  return results.sort((a, b) => a.position - b.position);
}

export function legacyEvidenceBlockReason(results: LegacyEvidenceResult[]): string | null {
  const divergent = results.filter((item) => item.status === "divergent");
  if (divergent.length) return `reconciliação legada divergente nas posições ${divergent.map((item) => item.position).join(", ")}`;
  const automaticMissing = results.filter((item) => item.classification === "canonical_state" && item.status !== "compatible");
  if (automaticMissing.length) return `reconciliação legada sem estado canônico suficiente nas posições ${automaticMissing.map((item) => item.position).join(", ")}`;
  const external = results.filter((item) => item.classification === "external_checkpoint_required" && item.status !== "compatible");
  if (external.length) return `reconciliação legada sem evidência histórica suficiente: checkpoint externo obrigatório ${external.map((item) => item.position).join(", ")}`;
  return null;
}

export function reconciledLegacyPositions(results: LegacyEvidenceResult[]): Set<number> {
  return new Set(
    results
      .filter((item) => item.status === "compatible" && item.classification !== "partial_compatibility")
      .map((item) => item.position),
  );
}