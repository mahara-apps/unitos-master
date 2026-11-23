import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/supabase-rpc";

const Pair = z.object({
  clientId: z.string().uuid(),
  userId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
});

/** Diz quem está atribuindo pode liberar o cliente para essa pessoa (regra no banco). */
export const clientAccessInfoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Pair.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as never;
    const [{ data: canGrant, error }, client, person] = await Promise.all([
      callRpc<boolean>(sb, "can_grant_client_access", { _client_id: data.clientId, _user_id: data.userId }),
      context.supabase.from("clients").select("name").eq("id", data.clientId).maybeSingle(),
      context.supabase.from("user_profiles").select("full_name, email").eq("id", data.userId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const p = person.data as { full_name?: string | null; email?: string | null } | null;
    return {
      canGrant: canGrant === true,
      clientName: (client.data as { name?: string } | null)?.name ?? "este cliente",
      personName: p?.full_name || p?.email || "Esta pessoa",
    };
  });

export const grantClientAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Pair.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await callRpc<boolean>(context.supabase as never, "grant_client_access", {
      _client_id: data.clientId,
      _user_id: data.userId,
      _task_id: data.taskId ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestClientAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Pair.parse(i))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await callRpc<string>(context.supabase as never, "request_client_access", {
      _client_id: data.clientId,
      _user_id: data.userId,
      _task_id: data.taskId ?? null,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listClientAccessRequestsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }> };
          };
        };
      };
    })
      .from("client_access_requests")
      .select("id, user_id, requested_by, task_id, created_at")
      .eq("client_id", data.clientId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ id: string; user_id: string; requested_by: string; task_id: string | null; created_at: string }>;
    const ids = [...new Set(list.flatMap((r) => [r.user_id, r.requested_by]))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: ps } = await context.supabase.from("user_profiles").select("id, full_name, email").in("id", ids);
      for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
        names.set(p.id, p.full_name || p.email || "Pessoa");
    }
    const withGrant = await Promise.all(
      list.map(async (r) => {
        const { data: can } = await callRpc<boolean>(context.supabase as never, "can_grant_client_access", {
          _client_id: data.clientId,
          _user_id: r.user_id,
        });
        return { ...r, personName: names.get(r.user_id) ?? "Pessoa", requesterName: names.get(r.requested_by) ?? "Pessoa", canDecide: can === true };
      }),
    );
    return withGrant;
  });

export const resolveClientAccessRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requestId: z.string().uuid(), approve: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await callRpc<boolean>(context.supabase as never, "resolve_client_access_request", {
      _request_id: data.requestId,
      _approve: data.approve,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pessoas do workspace com/sem acesso ao cliente e se quem vê pode liberar. */
export const listClientPeopleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ brandId: z.string().uuid(), clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as never;
    const { data: members, error } = await context.supabase
      .from("brand_members")
      .select("user_id, role")
      .eq("brand_id", data.brandId)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    const internal = ((members ?? []) as Array<{ user_id: string; role: string }>).filter((m) => m.role !== "client");
    const ids = internal.map((m) => m.user_id);
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: ps } = await context.supabase.from("user_profiles").select("id, full_name, email").in("id", ids);
      for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
        names.set(p.id, p.full_name || p.email || "Pessoa");
    }
    const rows = await Promise.all(
      internal.map(async (m) => {
        const [{ data: has }, { data: can }] = await Promise.all([
          callRpc<boolean>(sb, "can_access_client", { _client_id: data.clientId, _user_id: m.user_id }),
          callRpc<boolean>(sb, "can_grant_client_access", { _client_id: data.clientId, _user_id: m.user_id }),
        ]);
        return { userId: m.user_id, role: m.role, name: names.get(m.user_id) ?? "Pessoa", hasAccess: has === true, canGrant: can === true };
      }),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });
