import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertPrivilegedTestEnv } from "./test-env";

export { assertPrivilegedTestEnv, privilegedTestEnv, privilegedTestEnvAllowed } from "./test-env";

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const publishable =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!url || !serviceKey || !publishable) {
  throw new Error(
    "Ambiente incompleto: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY",
  );
}

const authOpts = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export const admin = createClient(url, serviceKey, authOpts);

export function anonClient(): SupabaseClient {
  return createClient(url!, publishable!, authOpts);
}

export type TestUser = { id: string; email: string; client: SupabaseClient };

type PooledUser = {
  id: string;
  email: string;
  accessToken: string;
};

type AuthPool = {
  users: Record<string, PooledUser>;
  stats: { created: number; signedIn: number; reused: number };
};

const TAG = `t${Date.now().toString(36)}`;
export const testTag = TAG;

const projectRef =
  process.env["SUPABASE_PROJECT_ID"] ?? new URL(url).hostname.split(".")[0] ?? "unknown";
const poolPath = join(tmpdir(), `unitos-auth-pool-${projectRef}.json`);
const poolStatsPath = join(tmpdir(), `unitos-auth-pool-${projectRef}-stats.json`);
let poolQueue: Promise<void> = Promise.resolve();

/** Usuários criados nesta execução — limpeza garantida no teardown global. */
const createdUserIds = new Set<string>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emptyPool(): AuthPool {
  return { users: {}, stats: { created: 0, signedIn: 0, reused: 0 } };
}

function readPool(): AuthPool {
  try {
    return JSON.parse(readFileSync(poolPath, "utf8")) as AuthPool;
  } catch {
    return emptyPool();
  }
}

function writePool(pool: AuthPool): void {
  const temporary = `${poolPath}.${process.pid}.${randomUUID()}`;
  writeFileSync(temporary, JSON.stringify(pool), { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, poolPath);
}

function withPoolLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = poolQueue.then(operation, operation);
  poolQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function pooledClient(accessToken: string): SupabaseClient {
  return createClient(url, publishable, {
    ...authOpts,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function pooledIds(): Set<string> {
  return new Set(Object.values(readPool().users).map((user) => user.id));
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size));
  }
  return result;
}

async function deleteTestUser(id: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error || /user not found/i.test(error.message)) {
      createdUserIds.delete(id);
      return null;
    }
    if (attempt < 2 && /database error|rate limit/i.test(error.message)) {
      await sleep(250 * 2 ** attempt);
      continue;
    }
    return error.message;
  }
  return "falha desconhecida";
}

async function deleteTestUsers(ids: string[], force = false): Promise<string[]> {
  const failures: string[] = [];
  const retained = force ? new Set<string>() : pooledIds();
  const deletable = ids.filter((id) => !retained.has(id));
  for (let offset = 0; offset < deletable.length; offset += 2) {
    const batch = deletable.slice(offset, offset + 2);
    const results = await Promise.all(batch.map(deleteTestUser));
    results.forEach((reason, index) => {
      const id = batch[index];
      if (reason && id) failures.push(`auth.users(${id}): ${reason}`);
    });
  }
  return failures;
}

async function deleteOwnedTestBrands(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const failures: string[] = [];
  for (const userIds of chunks(ids, 20)) {
    const brands = await admin.from("brands").select("id").in("created_by", userIds);
    if (brands.error) {
      failures.push(`brands lookup: ${brands.error.message}`);
      continue;
    }
    failures.push(...(await deleteTestBrands(brands.data.map((row) => row.id))));
    const remaining = await admin.from("brands").select("id").in("created_by", userIds);
    if (remaining.error) failures.push(`brands verify: ${remaining.error.message}`);
    else if (remaining.data.length)
      failures.push(`brands verify: ${remaining.data.length} workspace(s) de teste permaneceram`);
  }
  return failures;
}

async function deleteTestBrands(brandIds: string[]): Promise<string[]> {
  if (!brandIds.length) return [];
  const failures: string[] = [];
  for (const ids of chunks(brandIds, 20)) {
    const defaults = await admin
      .from("content_pipelines")
      .update({ is_default: false })
      .in("brand_id", ids)
      .eq("is_default", true);
    if (defaults.error) failures.push(`content_pipelines defaults: ${defaults.error.message}`);
    const pipelines = await admin.from("content_pipelines").delete().in("brand_id", ids);
    if (pipelines.error) failures.push(`content_pipelines: ${pipelines.error.message}`);
    const systemProfiles = await admin
      .from("access_profiles")
      .update({ is_system: false })
      .in("brand_id", ids)
      .eq("is_system", true);
    if (systemProfiles.error) failures.push(`access_profiles: ${systemProfiles.error.message}`);
    const removed = await admin.from("brands").delete().in("id", ids);
    if (removed.error) failures.push(`brands: ${removed.error.message}`);
  }
  return failures;
}

/** Limpa somente recursos cujos ids foram criados e registrados pelo teste chamador. */
export async function cleanupTestResources(userIds: string[], brandIds: string[]): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE_CLEANUP");
  const failures = await deleteTestBrands(brandIds);
  const remaining = await admin.from("brands").select("id").in("id", brandIds);
  if (remaining.error) failures.push(`brands verify: ${remaining.error.message}`);
  else if (remaining.data.length)
    failures.push(`brands verify: ${remaining.data.length} workspace(s) permaneceram`);
  failures.push(...(await releaseTestUsers(userIds)));
  if (failures.length) throw new Error(`Falha no cleanup da fixture: ${failures.join("; ")}`);
}

/**
 * Senha de teste NÃO derivável do e-mail: aleatória por conta (ou derivada de
 * um segredo exclusivo de teste + nonce aleatório). Nunca logada.
 */
export function generateTestPassword(): string {
  const secret = process.env["UNITOS_TEST_USER_PASSWORD_SECRET"] ?? "";
  const nonce = randomBytes(24).toString("base64url");
  return `Qa!${secret ? secret.slice(0, 8) : ""}${nonce}Aa1`;
}

async function createFreshUser(label: string): Promise<TestUser & { accessToken: string }> {
  const email = `qa+${TAG}-${label}-${randomUUID().slice(0, 8)}@unitos-tests.dev`;
  const password = generateTestPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `QA ${label}` },
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  if (!data.user) throw new Error(`createUser(${label}): usuário não retornado`);
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw new Error(`signIn(${label}): ${signedIn.error?.message ?? "sessão não retornada"}`);
  }
  createdUserIds.add(data.user.id);
  return { id: data.user.id, email, client, accessToken: signedIn.data.session.access_token };
}

/** Identidade exclusiva: mantém criação/login reais para cenários ad hoc. */
export async function createUser(label: string): Promise<TestUser> {
  const { accessToken: _accessToken, ...user } = await createFreshUser(label);
  await withPoolLock(async () => {
    const pool = readPool();
    pool.stats.created += 1;
    pool.stats.signedIn += 1;
    writePool(pool);
  });
  return user;
}

async function acquirePooledUser(slot: string): Promise<TestUser> {
  return withPoolLock(async () => {
    const pool = readPool();
    const pooled = pool.users[slot];
    if (pooled) {
      pool.stats.reused += 1;
      writePool(pool);
      createdUserIds.add(pooled.id);
      return { id: pooled.id, email: pooled.email, client: pooledClient(pooled.accessToken) };
    }

    const fresh = await createFreshUser(`pool-${slot}`);
    pool.users[slot] = {
      id: fresh.id,
      email: fresh.email,
      accessToken: fresh.accessToken,
    };
    pool.stats.created += 1;
    pool.stats.signedIn += 1;
    writePool(pool);
    return { id: fresh.id, email: fresh.email, client: pooledClient(fresh.accessToken) };
  });
}

/**
 * Único caminho autorizado para criar uma identidade SUPER ADMIN de teste.
 * Falha explicitamente em produção/ambiente desconhecido e registra a conta
 * para remoção do privilégio + exclusão no teardown.
 */
export async function createSuperAdminUser(label: string): Promise<TestUser> {
  assertPrivilegedTestEnv();
  const u = await createUser(label);
  const p = await admin
    .from("user_profiles")
    .upsert(
      { id: u.id, full_name: `QA Super ${label}`, is_super_admin: true },
      { onConflict: "id" },
    );
  if (p.error) throw new Error(`createSuperAdminUser(${label}): ${p.error.message}`);
  return u;
}

/** Limpa estado relacional mutável, preservando as identidades/sessões do pool. */
export async function releaseTestUsers(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const failures: string[] = [];
  const [profiles, brands, clients] = await Promise.all([
    admin.from("user_profiles").update({ is_super_admin: false, role: "user" }).in("id", ids),
    admin.from("brand_members").delete().in("user_id", ids),
    admin.from("client_members").delete().in("user_id", ids),
  ]);
  if (profiles.error) failures.push(`user_profiles: ${profiles.error.message}`);
  if (brands.error) failures.push(`brand_members: ${brands.error.message}`);
  if (clients.error) failures.push(`client_members: ${clients.error.message}`);
  failures.push(...(await deleteTestUsers(ids)));
  return failures;
}

/** Remove privilégio e apaga todas as identidades criadas nesta execução. */
export async function cleanupTestIdentities(): Promise<void> {
  const ids = [...createdUserIds];
  if (!ids.length) return;
  const failures: string[] = [];
  // brands.created_by é RESTRICT; remover o workspace primeiro também elimina
  // por cascata todos os dados produzidos pela fixture antes de apagar auth.users.
  failures.push(...(await deleteOwnedTestBrands(ids)));
  failures.push(...(await releaseTestUsers(ids)));
  if (failures.length)
    throw new Error(`Falha no cleanup de identidades QA: ${failures.join("; ")}`);
}

/** Remove identidades QA órfãs de execuções interrompidas antes do gate remoto. */
export async function cleanupStaleTestIdentities(): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE");
  for (let page = 1; ; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (listed.error) throw new Error(`Falha ao listar identidades QA: ${listed.error.message}`);
    const users = listed.data.users;
    for (const user of users) {
      const email = user.email?.toLowerCase() ?? "";
      if (email.includes("unitos-tests.dev") || email.startsWith("qa+"))
        createdUserIds.add(user.id);
    }
    if (users.length < 100) break;
  }
  const failures = await deleteOwnedTestBrands([...createdUserIds]);
  failures.push(...(await deleteTestUsers([...createdUserIds], true)));
  createdUserIds.clear();
  rmSync(poolPath, { force: true });
  if (failures.length) throw new Error(`Falha no cleanup QA inicial: ${failures.join("; ")}`);
}

/** Finaliza o pool global e grava apenas contadores não sensíveis para o relatório. */
export async function cleanupSharedTestUserPool(): Promise<void> {
  assertPrivilegedTestEnv("INTEGRATION_TEST_SUITE_CLEANUP");
  const pool = readPool();
  const ids = Object.values(pool.users).map((user) => user.id);
  if (!ids.length) return;
  const failures = await deleteOwnedTestBrands(ids);
  failures.push(...(await releaseTestUsers(ids)));
  failures.push(...(await deleteTestUsers(ids, true)));
  writeFileSync(poolStatsPath, JSON.stringify(pool.stats), { mode: 0o600 });
  rmSync(poolPath, { force: true });
  if (failures.length) throw new Error(`Falha no cleanup do pool QA: ${failures.join("; ")}`);
}

export type Fixture = {
  brandId: string;
  otherBrandId: string;
  clientA: string;
  clientB: string;
  /** Cliente da mesma marca sem owner_user_id e sem client_members (cliente "órfão"). */
  clientOrphan: string;
  otherBrandClient: string;
  otherBrandProject: string;
  /** owner da marca principal (papel efetivo 'admin'). NÃO tem vínculo com a outra brand. */
  userOwner: TestUser;
  /** criador/owner da segunda brand (workspace sem relação com a principal). */
  userOtherOwner: TestUser;
  /** manager da marca. */
  userManager: TestUser;
  /** user (papel efetivo 'user') vinculado somente ao clientA. */
  userA: TestUser;
  /** user (papel efetivo 'user') vinculado somente ao clientB. */
  userB: TestUser;
  /** user (papel efetivo 'user') membro da marca, sem nenhum vínculo de cliente. */
  userNoLink: TestUser;
  /** portal_client vinculado somente ao clientA. */
  userPortal: TestUser;
};

export async function seed(): Promise<Fixture> {
  // O trigger add_brand_owner força role='owner' para brands.created_by (NOT NULL).
  // Por isso o criador é um usuário dedicado, e A/B ficam como user puro.
  const userOwner = await acquirePooledUser("owner");
  const userManager = await acquirePooledUser("manager");
  const userA = await acquirePooledUser("user-a");
  const userB = await acquirePooledUser("user-b");
  const userNoLink = await acquirePooledUser("user-unassigned");
  const userPortal = await acquirePooledUser("portal");
  const userOtherOwner = await acquirePooledUser("other-owner");
  // Criador dedicado da segunda brand: o trigger add_brand_owner promove o
  // created_by a Owner, e a "outra brand" precisa ser um workspace em que
  // userOwner NÃO tem nenhum vínculo (cenário de cross-workspace).

  const brand = await admin
    .from("brands")
    .insert({ name: `QA Brand ${TAG}`, slug: `qa-brand-${TAG}`, created_by: userOwner.id })
    .select("id")
    .single();
  if (brand.error) throw new Error(`brand: ${brand.error.message}`);
  const otherBrand = await admin
    .from("brands")
    .insert({ name: `QA Brand2 ${TAG}`, slug: `qa-brand2-${TAG}`, created_by: userOtherOwner.id })
    .select("id")
    .single();
  if (otherBrand.error) throw new Error(`brand2: ${otherBrand.error.message}`);

  const brandId = brand.data.id as string;
  const otherBrandId = otherBrand.data.id as string;

  const memberships: Array<{ user: TestUser; role: string }> = [
    { user: userManager, role: "manager" },
    { user: userA, role: "user" },
    { user: userB, role: "user" },
    { user: userNoLink, role: "user" },
  ];
  const membershipInsert = await admin
    .from("brand_members")
    .insert(memberships.map((m) => ({ brand_id: brandId, user_id: m.user.id, role: m.role })));
  if (membershipInsert.error) throw new Error(`brand_members: ${membershipInsert.error.message}`);

  // Garantia explícita: nenhum papel foi promovido por trigger.
  const roles = await admin.from("brand_members").select("user_id, role").eq("brand_id", brandId);
  if (roles.error) throw new Error(`brand_members read: ${roles.error.message}`);
  for (const m of memberships) {
    const found = roles.data!.find((r) => r.user_id === m.user.id);
    if (!found || found.role !== m.role) {
      throw new Error(`papel inesperado para ${m.user.email}: ${found?.role ?? "ausente"}`);
    }
  }

  const clients = await admin
    .from("clients")
    .insert([
      { brand_id: brandId, name: `Cliente A ${TAG}` },
      { brand_id: brandId, name: `Cliente B ${TAG}` },
      { brand_id: brandId, name: `Cliente Orfao ${TAG}` },
      { brand_id: otherBrandId, name: `Cliente Outro ${TAG}` },
    ])
    .select("id, name");
  if (clients.error) throw new Error(`clients: ${clients.error.message}`);
  const clientA = clients.data.find((c) => c.name.startsWith("Cliente A"))!.id as string;
  const clientB = clients.data.find((c) => c.name.startsWith("Cliente B"))!.id as string;
  const clientOrphan = clients.data.find((c) => c.name.startsWith("Cliente Orfao"))!.id as string;
  const otherBrandClient = clients.data.find((c) => c.name.startsWith("Cliente Outro"))!
    .id as string;

  // Vínculos internos ativam o modo restritivo por cliente (can_access_client).
  const cm = await admin.from("client_members").insert([
    { brand_id: brandId, client_id: clientA, user_id: userA.id, role: "user" },
    { brand_id: brandId, client_id: clientB, user_id: userB.id, role: "user" },
    { brand_id: brandId, client_id: clientA, user_id: userPortal.id, role: "portal_client" },
  ]);
  if (cm.error) throw new Error(`client_members: ${cm.error.message}`);

  const otherProject = await admin
    .from("projects")
    .insert({
      brand_id: otherBrandId,
      client_id: otherBrandClient,
      name: `Projeto Outra Brand ${TAG}`,
      status: "active",
    })
    .select("id")
    .single();
  if (otherProject.error) throw new Error(`other project: ${otherProject.error.message}`);

  return {
    brandId,
    otherBrandId,
    clientA,
    clientB,
    clientOrphan,
    otherBrandClient,
    otherBrandProject: otherProject.data.id as string,
    userOwner,
    userManager,
    userA,
    userB,
    userNoLink,
    userPortal,
    userOtherOwner,
  };
}

export async function cleanup(fx: Fixture | null) {
  if (!fx) {
    await cleanupTestIdentities();
    return;
  }
  const users = [
    fx.userOwner,
    fx.userManager,
    fx.userA,
    fx.userB,
    fx.userNoLink,
    fx.userPortal,
    fx.userOtherOwner,
  ];
  const ids = users.map((u) => u.id);
  const brandIds = [fx.brandId, fx.otherBrandId];
  const failures: string[] = [];
  failures.push(...(await deleteTestBrands(brandIds)));
  const remaining = await admin.from("brands").select("id").in("id", brandIds);
  if (remaining.error) failures.push(`brands verify: ${remaining.error.message}`);
  else if (remaining.data.length)
    failures.push(`brands verify: ${remaining.data.length} workspace(s) da fixture permaneceram`);
  failures.push(...(await releaseTestUsers(ids)));
  if (failures.length) throw new Error(`Falha ao remover identidades QA: ${failures.join("; ")}`);
}

/** Espelha listProjectsFn: mesma workspace, sem arquivados/concluídos por padrão. */
export async function listProjects(c: SupabaseClient, brandId: string, includeInactive = false) {
  let q = c
    .from("projects")
    .select("id, name, client_id, status")
    .eq("brand_id", brandId)
    .order("name");
  if (!includeInactive) q = q.not("status", "in", "(archived,done)");
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Espelha listTasksFn (escopo + arquivamento + contadores de subtarefa). */
export async function listTasks(
  c: SupabaseClient,
  brandId: string,
  opts: { clientId?: string | null; archive?: "active" | "archived" | "all" } = {},
) {
  const archive = opts.archive ?? "active";
  let q = c
    .from("tasks")
    .select("id, title, client_id, project_id, archived_at, status, due_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (archive === "active") q = q.is("archived_at", null);
  else if (archive === "archived") q = q.not("archived_at", "is", null);
  const { data, error } = await q;
  if (error) throw error;
  const tasks = data ?? [];
  if (!tasks.length) return [];
  const subs = await c
    .from("task_subtasks")
    .select("task_id, done")
    .in(
      "task_id",
      tasks.map((t) => t.id),
    );
  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const s of subs.data ?? []) {
    total.set(s.task_id, (total.get(s.task_id) ?? 0) + 1);
    if (s.done) done.set(s.task_id, (done.get(s.task_id) ?? 0) + 1);
  }
  return tasks.map((t) => ({
    ...t,
    subtasks_total: total.get(t.id) ?? 0,
    subtasks_done: done.get(t.id) ?? 0,
  }));
}
