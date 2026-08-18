/**
 * FASE 1 RBAC — matriz de papéis × escopo executada com clients autenticados
 * reais (RLS exercida de verdade) e contra as funções canônicas do banco
 * (`app_access_role`, `can_access_client`, `my_access`).
 *
 * Papéis: SUPER ADMIN, ADMIN (owner), MANAGER, USER (operação), CLIENTE (portal).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, createUser, type TestUser } from "./helpers/fixtures";

const TAG = `rbac${Date.now().toString(36)}`;

type Ctx = {
  brandId: string;
  otherBrandId: string;
  clientAdminOnly: string; // sem responsável e sem vínculos → visível a toda a equipe
  clientOfUser: string; // owner_user_id = user
  clientOther: string; // de outro colaborador (fora do escopo do user)
  otherBrandClient: string;
  taskOther: string;
  superAdmin: TestUser;
  owner: TestUser;
  manager: TestUser;
  user: TestUser;
  portal: TestUser;
  outsider: TestUser;
};

let cx: Ctx;

async function role(userId: string, brandId: string | null) {
  const { data, error } = await admin.rpc("app_access_role" as never, {
    _user_id: userId,
    _brand_id: brandId,
  } as never);
  if (error) throw error;
  return data as string | null;
}

async function visibleClients(c: SupabaseClient, brandId: string) {
  const { data, error } = await c.from("clients").select("id").eq("brand_id", brandId);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

beforeAll(async () => {
  const [superAdmin, owner, manager, user, portal, outsider] = await Promise.all([
    createUser(`${TAG}-super`),
    createUser(`${TAG}-owner`),
    createUser(`${TAG}-manager`),
    createUser(`${TAG}-user`),
    createUser(`${TAG}-portal`),
    createUser(`${TAG}-outsider`),
  ]);

  await admin.from("user_profiles").update({ is_super_admin: true }).eq("id", superAdmin.id);

  const brands = await admin
    .from("brands")
    .insert([
      { name: `RBAC ${TAG}`, slug: `rbac-${TAG}`, created_by: owner.id },
      { name: `RBAC Outra ${TAG}`, slug: `rbac-outra-${TAG}`, created_by: outsider.id },
    ])
    .select("id, slug");
  if (brands.error) throw brands.error;
  const brandId = brands.data.find((b) => b.slug === `rbac-${TAG}`)!.id as string;
  const otherBrandId = brands.data.find((b) => b.slug === `rbac-outra-${TAG}`)!.id as string;

  await admin.from("brand_members").delete().in("brand_id", [brandId, otherBrandId]);
  const bm = await admin.from("brand_members").insert([
    { brand_id: brandId, user_id: owner.id, role: "owner" },
    { brand_id: brandId, user_id: manager.id, role: "manager" },
    { brand_id: brandId, user_id: user.id, role: "designer" },
    { brand_id: otherBrandId, user_id: outsider.id, role: "owner" },
  ]);
  if (bm.error) throw bm.error;

  const clients = await admin
    .from("clients")
    .insert([
      { brand_id: brandId, name: `Livre ${TAG}` },
      { brand_id: brandId, name: `DoUser ${TAG}`, owner_user_id: user.id },
      { brand_id: brandId, name: `DeOutro ${TAG}`, owner_user_id: manager.id },
      { brand_id: otherBrandId, name: `OutraBrand ${TAG}` },
    ])
    .select("id, name");
  if (clients.error) throw clients.error;
  const byName = (p: string) => clients.data.find((c) => c.name.startsWith(p))!.id as string;
  const clientAdminOnly = byName("Livre");
  const clientOfUser = byName("DoUser");
  const clientOther = byName("DeOutro");
  const otherBrandClient = byName("OutraBrand");

  const cm = await admin.from("client_members").insert([
    { brand_id: brandId, client_id: clientOfUser, user_id: portal.id, role: "portal_client" },
  ]);
  if (cm.error) throw cm.error;

  const task = await admin
    .from("tasks")
    .insert({ brand_id: brandId, client_id: clientOther, title: `Tarefa fora ${TAG}` })
    .select("id")
    .single();
  if (task.error) throw task.error;

  cx = {
    brandId,
    otherBrandId,
    clientAdminOnly,
    clientOfUser,
    clientOther,
    otherBrandClient,
    taskOther: task.data.id as string,
    superAdmin,
    owner,
    manager,
    user,
    portal,
    outsider,
  };
});

afterAll(async () => {
  if (!cx) return;
  const brands = [cx.brandId, cx.otherBrandId];
  await admin.from("tasks").delete().in("brand_id", brands);
  await admin.from("client_members").delete().in("brand_id", brands);
  await admin.from("clients").delete().in("brand_id", brands);
  await admin.from("brand_members").delete().in("brand_id", brands);
  await admin.from("brands").delete().in("id", brands);
  for (const u of [cx.superAdmin, cx.owner, cx.manager, cx.user, cx.portal, cx.outsider]) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
});

describe("papel canônico (fonte única)", () => {
  it("resolve os 5 papéis oficiais", async () => {
    expect(await role(cx.superAdmin.id, cx.brandId)).toBe("super_admin");
    expect(await role(cx.owner.id, cx.brandId)).toBe("admin");
    expect(await role(cx.manager.id, cx.brandId)).toBe("manager");
    expect(await role(cx.user.id, cx.brandId)).toBe("user");
    expect(await role(cx.portal.id, cx.brandId)).toBe("client");
  });

  it("MANAGER não é ADMIN", async () => {
    expect(await role(cx.manager.id, cx.brandId)).not.toBe("admin");
  });

  it("user_profiles.role não concede autoridade (apenas especialidade)", async () => {
    await admin.from("user_profiles").update({ role: "admin" }).eq("id", cx.user.id);
    expect(await role(cx.user.id, cx.brandId)).toBe("user");
  });

  it("papel é por marca — fora da marca não há papel", async () => {
    expect(await role(cx.user.id, cx.otherBrandId)).toBeNull();
  });
});

describe("escopo por cliente (my_access + RLS)", () => {
  it("ADMIN e MANAGER enxergam toda a marca", async () => {
    for (const u of [cx.owner, cx.manager]) {
      const ids = await visibleClients(u.client, cx.brandId);
      expect(ids.sort()).toEqual([cx.clientAdminOnly, cx.clientOfUser, cx.clientOther].sort());
    }
  });

  it("USER fica limitado ao escopo (responsável + clientes sem atribuição)", async () => {
    const ids = await visibleClients(cx.user.client, cx.brandId);
    expect(ids).toContain(cx.clientOfUser);
    expect(ids).toContain(cx.clientAdminOnly);
    expect(ids).not.toContain(cx.clientOther);
  });

  it("USER não alcança cliente fora do escopo por acesso direto (URL/id)", async () => {
    const { data } = await cx.user.client.from("clients").select("id").eq("id", cx.clientOther);
    expect(data ?? []).toHaveLength(0);
    const t = await cx.user.client.from("tasks").select("id").eq("id", cx.taskOther);
    expect(t.data ?? []).toHaveLength(0);
  });

  it("CLIENTE (portal) fica isolado ao próprio cliente", async () => {
    const ids = await visibleClients(cx.portal.client, cx.brandId);
    expect(ids).toEqual([cx.clientOfUser]);
    const t = await cx.portal.client.from("tasks").select("id").eq("id", cx.taskOther);
    expect(t.data ?? []).toHaveLength(0);
  });

  it("SUPER ADMIN é global (as duas marcas)", async () => {
    const a = await visibleClients(cx.superAdmin.client, cx.brandId);
    const b = await visibleClients(cx.superAdmin.client, cx.otherBrandId);
    expect(a).toHaveLength(3);
    expect(b).toEqual([cx.otherBrandClient]);
  });

  it("isolamento entre marcas", async () => {
    for (const u of [cx.owner, cx.manager, cx.user]) {
      expect(await visibleClients(u.client, cx.otherBrandId)).toHaveLength(0);
    }
    expect(await visibleClients(cx.outsider.client, cx.brandId)).toHaveLength(0);
  });

  it("my_access espelha exatamente a RLS", async () => {
    for (const u of [cx.owner, cx.manager, cx.user]) {
      const { data, error } = await u.client.rpc("my_access" as never, {
        _brand_id: cx.brandId,
      } as never);
      if (error) throw error;
      const payload = data as { role: string; client_ids: string[] };
      expect(payload.client_ids.sort()).toEqual((await visibleClients(u.client, cx.brandId)).sort());
      expect(payload.role).toBe(await role(u.id, cx.brandId));
    }
  });
});

describe("autoridade de escrita (RLS)", () => {
  it("USER não cria nem exclui clientes", async () => {
    const ins = await cx.user.client
      .from("clients")
      .insert({ brand_id: cx.brandId, name: `Proibido ${TAG}` });
    expect(ins.error).toBeTruthy();
    const del = await cx.user.client.from("clients").delete().eq("id", cx.clientOfUser).select("id");
    expect(del.data ?? []).toHaveLength(0);
  });

  it("MANAGER cria cliente, mas não vira dono da marca", async () => {
    const ins = await cx.manager.client
      .from("clients")
      .insert({ brand_id: cx.brandId, name: `DoManager ${TAG}` })
      .select("id");
    expect(ins.error).toBeNull();
    await admin.from("clients").delete().eq("id", (ins.data ?? [{ id: "" }])[0]!.id);

    const promote = await cx.manager.client
      .from("brand_members")
      .update({ role: "owner" })
      .eq("brand_id", cx.brandId)
      .eq("user_id", cx.user.id)
      .select("id");
    expect(promote.data ?? []).toHaveLength(0);

    const editOwner = await cx.manager.client
      .from("brand_members")
      .update({ role: "editor" })
      .eq("brand_id", cx.brandId)
      .eq("user_id", cx.owner.id)
      .select("id");
    expect(editOwner.data ?? []).toHaveLength(0);
  });

  it("MANAGER não edita a marca (só ADMIN)", async () => {
    const m = await cx.manager.client
      .from("brands")
      .update({ name: `Hack ${TAG}` })
      .eq("id", cx.brandId)
      .select("id");
    expect(m.data ?? []).toHaveLength(0);
    const o = await cx.owner.client
      .from("brands")
      .update({ name: `RBAC ${TAG}` })
      .eq("id", cx.brandId)
      .select("id");
    expect(o.data ?? []).toHaveLength(1);
  });

  it("USER não gerencia membros da equipe", async () => {
    const r = await cx.user.client
      .from("brand_members")
      .update({ role: "owner" })
      .eq("brand_id", cx.brandId)
      .eq("user_id", cx.user.id)
      .select("id");
    expect(r.data ?? []).toHaveLength(0);
  });
});
