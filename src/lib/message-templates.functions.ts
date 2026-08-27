import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EVENTS,
  getEvent,
  getDefault,
  renderTemplateString,
  buildSampleContext,
  type Channel,
} from "./message-templates.catalog";

const brandIdSchema = z.object({ brandId: z.string().uuid() });

export type TemplateRecord = {
  id: string;
  brand_id: string;
  event_key: string;
  channel: Channel;
  subject: string | null;
  body: string;
  is_active: boolean;
  updated_at: string;
};

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => brandIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("message_templates")
      .select("id, brand_id, event_key, channel, subject, body, is_active, updated_at")
      .eq("brand_id", data.brandId);
    if (error) throw new Error(error.message);
    return { templates: (rows ?? []) as TemplateRecord[] };
  });

const upsertSchema = z.object({
  brandId: z.string().uuid(),
  eventKey: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
  subject: z.string().max(300).optional().nullable(),
  body: z.string().min(1).max(20000),
  isActive: z.boolean().default(true),
});

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const event = getEvent(data.eventKey);
    if (!event) throw new Error("evento_desconhecido");
    if (!event.channels.includes(data.channel)) throw new Error("canal_invalido_para_evento");
    const variablesUsed = Array.from(
      new Set([...data.body.matchAll(/\{\{\s*([a-zA-Z0-9._-]+)\s*\}\}/g)].map((m) => m[1])),
    );
    const { data: row, error } = await context.supabase
      .from("message_templates")
      .upsert(
        {
          brand_id: data.brandId,
          event_key: data.eventKey,
          channel: data.channel,
          subject: data.subject ?? null,
          body: data.body,
          is_active: data.isActive,
          variables_used: variablesUsed,
          updated_by: context.userId,
        },
        { onConflict: "brand_id,event_key,channel" },
      )
      .select("id, brand_id, event_key, channel, subject, body, is_active, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { template: row as TemplateRecord };
  });

const resetSchema = z.object({
  brandId: z.string().uuid(),
  eventKey: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
});

export const resetTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_templates")
      .delete()
      .eq("brand_id", data.brandId)
      .eq("event_key", data.eventKey)
      .eq("channel", data.channel);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const testSchema = z.object({
  brandId: z.string().uuid(),
  eventKey: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
  to: z.string().min(3).max(200),
});

export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testSchema.parse(data))
  .handler(async ({ data, context }) => {
    const event = getEvent(data.eventKey);
    if (!event) throw new Error("evento_desconhecido");
    const ctx = buildSampleContext(event);
    const subject = renderTemplateString(data.subject ?? "", ctx);
    const body = renderTemplateString(data.body, ctx);

    if (data.channel === "email") {
      // Escopo: o client autenticado (RLS) só alcança a credencial da marca do
      // próprio usuário — e é a MESMA lida pelo status exibido na UI.
      const { assertBrandMember } = await import("@/lib/access-guard");
      await assertBrandMember(context.supabase, context.userId, data.brandId);
      const { sendBrandEmail } = await import("@/lib/email/resend.server");
      const result = await sendBrandEmail(context.supabase, data.brandId, {
        to: data.to,
        subject,
        html: body,
      });
      if (!result.sent) return { sent: false, error: result.error ?? "falha_no_envio" };
      return { sent: true, previewSubject: subject, previewBody: body, from: result.from };
    }

    // WhatsApp: por enquanto retorna preview renderizado (integração via provider é feita fora).
    return {
      sent: false,
      error: "whatsapp_provider_nao_configurado",
      previewBody: body,
    };
  });

export function listCatalog() {
  return EVENTS;
}

export function defaultForEvent(eventKey: string, channel: Channel) {
  return getDefault(eventKey, channel);
}
