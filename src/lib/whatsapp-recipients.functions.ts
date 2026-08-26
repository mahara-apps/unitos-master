// Destinatários de WhatsApp expostos ao app: listar, criar, editar,
// ativar/desativar, remover, além do envio pelo serviço único.
// Nada de inbox, atendimento ou leitura de mensagens.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WHATSAPP_RECIPIENT_TYPES, type WhatsappRecipientRow } from "@/lib/whatsapp/types";

const ListInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid().nullish(),
});

const CreateInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid().nullish(),
  type: z.enum(WHATSAPP_RECIPIENT_TYPES),
  name: z.string().trim().min(2).max(120),
  roleLabel: z.string().trim().max(80).nullish(),
  /** Telefone (contato) ou JID do grupo. Ignorado nos tipos dinâmicos. */
  destination: z.string().trim().max(120).nullish(),
  userId: z.string().uuid().nullish(),
});

const UpdateInput = z.object({
  brandId: z.string().uuid(),
  recipientId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  roleLabel: z.string().trim().max(80).nullish(),
  destination: z.string().trim().max(120).nullish(),
  isActive: z.boolean().optional(),
});

const DeleteInput = z.object({
  brandId: z.string().uuid(),
  recipientId: z.string().uuid(),
});

const SendInput = z.object({
  brandId: z.string().uuid(),
  instanceId: z.string().uuid(),
  recipientIds: z.array(z.string().uuid()).min(1).max(50),
  message: z.string().trim().min(1).max(4096),
});

const ResolveInput = z.object({
  brandId: z.string().uuid(),
  recipientIds: z.array(z.string().uuid()).min(1).max(50),
});

type Row = Record<string, unknown>;

function mapRow(row: Row): WhatsappRecipientRow {
  const client = row["clients"] as { name: string | null } | null;
  const profile = row["user_profiles"] as { full_name: string | null } | null;
  return {
    id: row["id"] as string,
    brandId: row["brand_id"] as string,
    clientId: (row["client_id"] as string | null) ?? null,
    clientName: client?.name ?? null,
    userId: (row["user_id"] as string | null) ?? null,
    userName: profile?.full_name ?? null,
    type: row["type"] as WhatsappRecipientRow["type"],
    name: row["name"] as string,
    roleLabel: (row["role_label"] as string | null) ?? null,
    destination: (row["destination"] as string | null) ?? null,
    isActive: row["is_active"] as boolean,
    createdAt: row["created_at"] as string,
  };
}

/** Lista destinatários visíveis (RLS aplica workspace + escopo por cliente). */
export const listWhatsappRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<WhatsappRecipientRow[]> => {
    const { assertBrandMember } = await import("@/lib/access-guard");
    await assertBrandMember(context.supabase, context.userId, data.brandId);

    let query = context.supabase
      .from("whatsapp_recipients")
      .select("*, clients(name), user_profiles(full_name)")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: true });
    if (data.clientId) query = query.eq("client_id", data.clientId);

    const { data: rows, error } = await query;
    if (error) throw error;
    return (rows ?? []).map((r) => mapRow(r as Row));
  });

/** Cria um destinatário. Escopo do cliente e autoridade são validados aqui. */
export const createWhatsappRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { assertBrandAdmin, assertClientInBrand } = await import("@/lib/access-guard");
    const { parseDestination } = await import("@/lib/whatsapp/destination");
    const { DYNAMIC_RECIPIENT_TYPES } = await import("@/lib/whatsapp/types");

    const clientId = data.clientId ?? null;
    if (clientId) {
      // Valida cliente ∈ workspace E escopo do usuário (MANAGER/USER).
      await assertClientInBrand(context.supabase, context.userId, data.brandId, clientId);
    } else {
      // Destinatário de workspace: apenas autoridade administrativa.
      await assertBrandAdmin(context.supabase, context.userId, data.brandId);
    }

    if (["client_contact", "account_manager", "whatsapp_group"].includes(data.type) && !clientId) {
      throw new Error("Este tipo de destinatário exige um cliente.");
    }

    let destination: string | null = null;
    if (data.type === "whatsapp_group") {
      const parsed = parseDestination("group", data.destination);
      if (!parsed) throw new Error("Identificador de grupo inválido (formato ...@g.us).");
      destination = parsed.value;
    } else if (data.type === "client_contact") {
      const parsed = parseDestination("phone", data.destination);
      if (!parsed) throw new Error("Telefone inválido.");
      destination = parsed.value;
    }

    let userId: string | null = null;
    if (DYNAMIC_RECIPIENT_TYPES.includes(data.type)) {
      userId = data.userId ?? null;
      if (data.type === "workspace_user" && !userId) {
        throw new Error("Selecione o usuário do workspace.");
      }
      if (userId) {
        // Sem ficha duplicada: o telefone vem do cadastro do usuário e o
        // usuário precisa pertencer ao workspace.
        const { data: member, error } = await context.supabase
          .from("brand_members")
          .select("user_id")
          .eq("brand_id", data.brandId)
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (error) throw error;
        if (!member) throw new Error("Usuário não pertence a este workspace.");
      }
    }

    const { data: inserted, error } = await context.supabase
      .from("whatsapp_recipients")
      .insert({
        brand_id: data.brandId,
        client_id: clientId,
        user_id: userId,
        type: data.type,
        name: data.name,
        role_label: data.roleLabel ?? null,
        destination,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Este destinatário já está cadastrado.");
      throw error;
    }
    return { id: (inserted as { id: string }).id };
  });

/** Atualiza nome/função/destino/ativo de um destinatário do workspace. */
export const updateWhatsappRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { assertBrandAdmin, assertClientScope } = await import("@/lib/access-guard");
    const { parseDestination } = await import("@/lib/whatsapp/destination");

    const { data: row, error: loadError } = await context.supabase
      .from("whatsapp_recipients")
      .select("id, brand_id, client_id, type")
      .eq("id", data.recipientId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) throw new Error("Destinatário não encontrado neste workspace.");

    const clientId = (row.client_id as string | null) ?? null;
    if (clientId) await assertClientScope(context.supabase, context.userId, clientId);
    else await assertBrandAdmin(context.supabase, context.userId, data.brandId);

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update["name"] = data.name;
    if (data.roleLabel !== undefined) update["role_label"] = data.roleLabel ?? null;
    if (data.isActive !== undefined) update["is_active"] = data.isActive;
    if (data.destination !== undefined && data.destination !== null) {
      const type = row.type as string;
      if (type === "whatsapp_group") {
        const parsed = parseDestination("group", data.destination);
        if (!parsed) throw new Error("Identificador de grupo inválido (formato ...@g.us).");
        update["destination"] = parsed.value;
      } else if (type === "client_contact") {
        const parsed = parseDestination("phone", data.destination);
        if (!parsed) throw new Error("Telefone inválido.");
        update["destination"] = parsed.value;
      }
    }
    if (!Object.keys(update).length) return { ok: true };

    const { error } = await context.supabase
      .from("whatsapp_recipients")
      .update(update as never)
      .eq("id", data.recipientId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

/** Remove um destinatário. */
export const deleteWhatsappRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { assertBrandAdmin, assertClientScope } = await import("@/lib/access-guard");
    const { data: row, error: loadError } = await context.supabase
      .from("whatsapp_recipients")
      .select("id, client_id")
      .eq("id", data.recipientId)
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) throw new Error("Destinatário não encontrado neste workspace.");

    const clientId = (row.client_id as string | null) ?? null;
    if (clientId) await assertClientScope(context.supabase, context.userId, clientId);
    else await assertBrandAdmin(context.supabase, context.userId, data.brandId);

    const { error } = await context.supabase
      .from("whatsapp_recipients")
      .delete()
      .eq("id", data.recipientId)
      .eq("brand_id", data.brandId);
    if (error) throw error;
    return { ok: true };
  });

/** Pré-visualiza a resolução dos destinatários (sem enviar nada). */
export const resolveWhatsappRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { resolveRecipients } = await import("@/lib/whatsapp/recipients.server");
    const { maskDestination } = await import("@/lib/whatsapp/destination");
    const { resolved, unresolved } = await resolveRecipients(
      context.supabase,
      context.userId,
      data.brandId,
      data.recipientIds,
    );
    return {
      resolved: resolved.map((r) => ({
        recipientId: r.recipientId,
        type: r.type,
        label: r.label,
        kind: r.destination.kind,
        destination: maskDestination(r.destination),
      })),
      unresolved,
    };
  });

/** Envio via serviço único (múltiplos destinatários geram envios individuais). */
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { sendWhatsappToRecipients } = await import("@/lib/whatsapp/send.server");
    return sendWhatsappToRecipients(context.supabase, context.userId, {
      brandId: data.brandId,
      instanceId: data.instanceId,
      recipientIds: data.recipientIds,
      message: data.message,
    });
  });

/**
 * Usuários do workspace elegíveis como destinatário.
 * Não devolve o telefone: apenas se existe cadastro utilizável (sem duplicar
 * dados nem expor contato de terceiros).
 */
export const listWhatsappEligibleUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<Array<{ userId: string; name: string; role: string; hasWhatsapp: boolean }>> => {
      const { assertBrandMember } = await import("@/lib/access-guard");
      const { normalizePhone } = await import("@/lib/whatsapp/destination");
      await assertBrandMember(context.supabase, context.userId, data.brandId);

      const { data: members, error } = await context.supabase
        .from("brand_members")
        .select("user_id, role")
        .eq("brand_id", data.brandId)
        .eq("is_active", true);
      if (error) throw error;
      const ids = (members ?? []).map((m) => m.user_id as string);
      if (!ids.length) return [];

      const { data: profiles } = await context.supabase
        .from("user_profiles")
        .select("id, full_name, whatsapp, phone")
        .in("id", ids);

      return (members ?? []).map((m) => {
        const p = (profiles ?? []).find((x) => x.id === m.user_id) as
          | { full_name?: string | null; whatsapp?: string | null; phone?: string | null }
          | undefined;
        return {
          userId: m.user_id as string,
          name: p?.full_name ?? "Usuário",
          role: m.role as string,
          hasWhatsapp: Boolean(normalizePhone(p?.whatsapp) ?? normalizePhone(p?.phone)),
        };
      });
    },
  );
