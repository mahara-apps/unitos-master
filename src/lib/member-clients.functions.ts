import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/supabase-rpc";
import { assertBrandAdmin } from "@/lib/access-guard";
import { ClientAccessSchema, type ClientAccess } from "@/lib/member-clients";

type SetResult = { added: number; removed: number; allClients: boolean; clientCount: number };

/**
 * Aplica o conjunto de clientes de um membro com a autoridade de quem está
 * logado. Toda a hierarquia é conferida no banco; erro nunca vira sucesso.
 */
export async function applyMemberClientsAccess(
  supabase: unknown,
  brandId: string,
  userId: string,
  access: ClientAccess,
): Promise<SetResult> {
  const { data, error } = await callRpc<SetResult>(supabase as never, "set_member_clients", {
    _brand_id: brandId,
    _user_id: userId,
    _all: access.all,
    _client_ids: access.clientIds,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida ao liberar clientes.");
  }
  return data;
}

/**
 * Clientes que quem está logado pode liberar (RLS já limita o Manager aos que
 * ele acessa) + estado atual do membro, quando informado.
 */
export const listMemberClientsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ brandId: z.string().uuid(), userId: z.string().uuid().nullable().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const actorRole = await assertBrandAdmin(supabase as never, actorId, data.brandId);
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, name, owner_user_id")
      .eq("brand_id", data.brandId)
      .order("name", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    const list = (clients ?? []) as Array<{ id: string; name: string | null; owner_user_id: string | null }>;

    const { data: me, error: meErr } = await supabase
      .from("brand_members")
      .select("all_clients")
      .eq("brand_id", data.brandId)
      .eq("user_id", actorId)
      .maybeSingle();
    if (meErr) throw new Error(meErr.message);
    const actorCanGrantAll =
      actorRole === "super_admin" || actorRole === "admin" || me?.all_clients === true;

    let selectedIds: string[] = [];
    let allClients = false;
    if (data.userId) {
      const [rows, member] = await Promise.all([
        supabase
          .from("client_members")
          .select("client_id, role")
          .eq("brand_id", data.brandId)
          .eq("user_id", data.userId)
          .neq("role", "portal_client"),
        supabase
          .from("brand_members")
          .select("all_clients")
          .eq("brand_id", data.brandId)
          .eq("user_id", data.userId)
          .maybeSingle(),
      ]);
      if (rows.error) throw new Error(rows.error.message);
      if (member.error) throw new Error(member.error.message);
      selectedIds = (rows.data ?? []).map((r) => r.client_id as string);
      allClients = member.data?.all_clients === true;
    }

    return {
      actorCanGrantAll,
      allClients,
      selectedIds,
      ownedIds: data.userId
        ? list.filter((c) => c.owner_user_id === data.userId).map((c) => c.id)
        : [],
      clients: list.map((c) => ({ id: c.id, name: c.name?.trim() || "Cliente sem nome" })),
    };
  });

export const setMemberClientsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ brandId: z.string().uuid(), userId: z.string().uuid(), access: ClientAccessSchema })
      .parse(i),
  )
  .handler(async ({ data, context }) =>
    applyMemberClientsAccess(context.supabase, data.brandId, data.userId, data.access),
  );
