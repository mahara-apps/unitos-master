import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const TAG = `t${Date.now().toString(36)}`;
export const testTag = TAG;

export async function createUser(label: string): Promise<TestUser> {
  const email = `qa+${TAG}-${label}@unitos-tests.dev`;
  const password = `Qa!${TAG}${label}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `QA ${label}` },
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn(${label}): ${signIn.error.message}`);
  return { id: data.user!.id, email, client };
}

export type Fixture = {
  brandId: string;
  otherBrandId: string;
  clientA: string;
  clientB: string;
  otherBrandClient: string;
  otherBrandProject: string;
  userA: TestUser;
  userB: TestUser;
};

export async function seed(): Promise<Fixture> {
  const userA = await createUser("a");
  const userB = await createUser("b");

  const brand = await admin
    .from("brands")
    .insert({ name: `QA Brand ${TAG}`, slug: `qa-brand-${TAG}`, created_by: userA.id })
    .select("id")
    .single();
  if (brand.error) throw new Error(`brand: ${brand.error.message}`);
  const otherBrand = await admin
    .from("brands")
    .insert({ name: `QA Brand2 ${TAG}`, slug: `qa-brand2-${TAG}`, created_by: userB.id })
    .select("id")
    .single();
  if (otherBrand.error) throw new Error(`brand2: ${otherBrand.error.message}`);

  const brandId = brand.data.id as string;
  const otherBrandId = otherBrand.data.id as string;

  // brands trigger add_brand_owner pode já inserir o criador; upsert defensivo.
  for (const [bid, uid] of [
    [brandId, userA.id],
    [brandId, userB.id],
  ] as const) {
    const existing = await admin
      .from("brand_members")
      .select("id")
      .eq("brand_id", bid)
      .eq("user_id", uid)
      .maybeSingle();
    if (!existing.data) {
      const r = await admin.from("brand_members").insert({ brand_id: bid, user_id: uid, role: "editor" });
      if (r.error) throw new Error(`brand_members: ${r.error.message}`);
    }
  }

  const clients = await admin
    .from("clients")
    .insert([
      { brand_id: brandId, name: `Cliente A ${TAG}` },
      { brand_id: brandId, name: `Cliente B ${TAG}` },
      { brand_id: otherBrandId, name: `Cliente Outro ${TAG}` },
    ])
    .select("id, name");
  if (clients.error) throw new Error(`clients: ${clients.error.message}`);
  const clientA = clients.data.find((c) => c.name.startsWith("Cliente A"))!.id as string;
  const clientB = clients.data.find((c) => c.name.startsWith("Cliente B"))!.id as string;
  const otherBrandClient = clients.data.find((c) => c.name.startsWith("Cliente Outro"))!.id as string;

  // Vínculos internos ativam o modo restritivo por cliente (can_access_client).
  const cm = await admin.from("client_members").insert([
    { brand_id: brandId, client_id: clientA, user_id: userA.id, role: "editor" },
    { brand_id: brandId, client_id: clientB, user_id: userB.id, role: "editor" },
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
    otherBrandClient,
    otherBrandProject: otherProject.data.id as string,
    userA,
    userB,
  };
}

export async function cleanup(fx: Fixture | null) {
  if (!fx) return;
  await admin.from("task_subtasks").delete().in("brand_id", [fx.brandId, fx.otherBrandId]);
  await admin.from("tasks").delete().in("brand_id", [fx.brandId, fx.otherBrandId]);
  await admin.from("projects").delete().in("brand_id", [fx.brandId, fx.otherBrandId]);
  await admin.from("client_members").delete().in("brand_id", [fx.brandId, fx.otherBrandId]);
  await admin.from("clients").delete().in("brand_id", [fx.brandId, fx.otherBrandId]);
  await admin.from("brand_members").delete().in("brand_id", [fx.brandId, fx.otherBrandId]);
  await admin.from("brands").delete().in("id", [fx.brandId, fx.otherBrandId]);
  for (const u of [fx.userA, fx.userB]) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
}

/** Espelha listProjectsFn: mesma workspace, sem arquivados/concluídos por padrão. */
export async function listProjects(
  c: SupabaseClient,
  brandId: string,
  includeInactive = false,
) {
  let q = c.from("projects").select("id, name, client_id, status").eq("brand_id", brandId).order("name");
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
    .in("task_id", tasks.map((t) => t.id));
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
