/**
 * Admin global — `public.user_profiles.role = 'admin'` concede autoridade de
 * workspace em toda a agência (sem virar super_admin) mesmo sem linha em
 * `brand_members`. Valida as fontes canônicas: app_access_role, my_access,
 * is_brand_member, can_access_client + RLS de brands/clients.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createUser, type TestUser } from "./helpers/fixtures";

let globalAdmin: TestUser;
let plainUser: TestUser;
let brandId: string;
let clientId: string;

beforeAll(async () => {
  globalAdmin = await createUser("gadmin");
  plainUser = await createUser("gplain");

  // Marca + cliente criados por um terceiro (nem globalAdmin nem plainUser
  // possuem membership nela).
  const owner = await createUser("gowner");
  const brand = await admin
    .from("brands")
    .insert({ name: `QA GA ${Date.now()}`, slug: `qa-ga-${Date.now()}`, created_by: owner.id })
    .select("id")
    .single();
  if (brand.error) throw brand.error;
  brandId = brand.data.id;

  const client = await admin
    .from("clients")
    .insert({ brand_id: brandId, name: "QA GA Client" })
    .select("id")
    .single();
  if (client.error) throw client.error;
  clientId = client.data.id;

  await admin.from("brand_members").delete().eq("user_id", globalAdmin.id);
  await admin.from("brand_members").delete().eq("user_id", plainUser.id);
  const up = await admin.from("user_profiles").update({ role: "admin" }).eq("id", globalAdmin.id);
  if (up.error) throw up.error;
});

afterAll(async () => {
  await admin.from("clients").delete().eq("id", clientId);
  await admin.from("brands").delete().eq("id", brandId);
});

describe("admin global (user_profiles.role = 'admin')", () => {
  it("app_access_role retorna 'admin' na marca sem membership", async () => {
    const { data, error } = await globalAdmin.client.rpc("app_access_role", {
      _user_id: globalAdmin.id,
      _brand_id: brandId,
    });
    expect(error).toBeNull();
    expect(data).toBe("admin");
  });

  it("não é promovido a super_admin", async () => {
    const { data } = await globalAdmin.client.rpc("my_access", { _brand_id: brandId });
    const row = (data ?? {}) as Record<string, unknown>;
    expect(row["role"]).toBe("admin");
    expect(row["is_super_admin"]).not.toBe(true);
  });

  it("enxerga a marca e o cliente da agência via RLS", async () => {
    const brands = await globalAdmin.client.from("brands").select("id").eq("id", brandId);
    expect(brands.error).toBeNull();
    expect(brands.data?.length).toBe(1);

    const clients = await globalAdmin.client.from("clients").select("id").eq("id", clientId);
    expect(clients.error).toBeNull();
    expect(clients.data?.length).toBe(1);
  });

  it("opera áreas da agência antes restritas a membros explícitos", async () => {
    const conn = await admin
      .from("social_connections")
      .insert({ brand_id: brandId, provider: "meta", account_name: "QA GA IG", status: "active" })
      .select("id")
      .single();
    if (conn.error) throw conn.error;

    const link = await admin
      .from("client_members")
      .insert({ brand_id: brandId, client_id: clientId, user_id: globalAdmin.id, role: "member" })
      .select("id")
      .single();
    if (link.error) throw link.error;

    const conns = await globalAdmin.client.from("social_connections").select("id").eq("id", conn.data.id);
    expect(conns.error).toBeNull();
    expect(conns.data?.length).toBe(1);

    const members = await globalAdmin.client.from("client_members").select("id").eq("brand_id", brandId);
    expect(members.error).toBeNull();
    expect((members.data ?? []).length).toBeGreaterThan(0);

    const sla = await globalAdmin.client
      .from("sla_rules")
      .insert({ brand_id: brandId, name: "QA GA SLA", hours: 24 })
      .select("id")
      .single();
    expect(sla.error).toBeNull();

    // usuário comum sem membership não alcança nada disso
    const otherConns = await plainUser.client.from("social_connections").select("id").eq("id", conn.data.id);
    expect(otherConns.data ?? []).toHaveLength(0);
    const otherMembers = await plainUser.client.from("client_members").select("id").eq("brand_id", brandId);
    expect(otherMembers.data ?? []).toHaveLength(0);

    await admin.from("sla_rules").delete().eq("brand_id", brandId);
    await admin.from("client_members").delete().eq("id", link.data.id);
    await admin.from("social_connections").delete().eq("id", conn.data.id);
  });

  it("usuário comum sem membership continua sem acesso", async () => {
    const role = await plainUser.client.rpc("app_access_role", {
      _user_id: plainUser.id,
      _brand_id: brandId,
    });
    expect(role.data).not.toBe("admin");

    const brands = await plainUser.client.from("brands").select("id").eq("id", brandId);
    expect(brands.data ?? []).toHaveLength(0);
    const clients = await plainUser.client.from("clients").select("id").eq("id", clientId);
    expect(clients.data ?? []).toHaveLength(0);
  });
});

