import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STAGE_COLORS = [
  "muted",
  "sky",
  "violet",
  "amber",
  "emerald",
  "rose",
  "indigo",
  "cyan",
] as const;
export type CrmStageColor = (typeof STAGE_COLORS)[number];

const CLINICAL_TEMPLATE: Array<{ label: string; color: CrmStageColor; is_won?: boolean }> = [
  { label: "Lead", color: "muted" },
  { label: "Consulta", color: "sky" },
  { label: "Avaliação", color: "violet" },
  { label: "Tratamento", color: "amber" },
  { label: "Retorno", color: "emerald", is_won: true },
];

export type CrmPipeline = {
  id: string;
  brand_id: string;
  client_id: string;
  name: string;
  description: string | null;
  vertical: string;
  is_default: boolean;
  position: number;
};

export type CrmStage = {
  id: string;
  pipeline_id: string;
  label: string;
  color: CrmStageColor;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type CrmDeal = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  brand_id: string;
  client_id: string;
  contact_name: string;
  contact_initials: string | null;
  service: string | null;
  owner_name: string | null;
  amount_cents: number;
  currency: string;
  whatsapp: string | null;
  status: string;
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmBoard = {
  pipeline: CrmPipeline;
  stages: CrmStage[];
  deals: CrmDeal[];
};

const scope = z.object({ brandId: z.string().uuid(), clientId: z.string().uuid() });

export const listCrmPipelinesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scope.parse(i))
  .handler(async ({ data, context }): Promise<CrmPipeline[]> => {
    const { data: rows, error } = await context.supabase
      .from("crm_pipelines")
      .select("id,brand_id,client_id,name,description,vertical,is_default,position")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const ensureDefaultCrmPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scope.parse(i))
  .handler(async ({ data, context }): Promise<CrmPipeline> => {
    const { data: existing } = await context.supabase
      .from("crm_pipelines")
      .select("id,brand_id,client_id,name,description,vertical,is_default,position")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (existing && existing.length > 0) return existing[0] as CrmPipeline;

    const { data: pipe, error } = await context.supabase
      .from("crm_pipelines")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        name: "Jornada do Paciente",
        description: "Funil completo de atendimento ao paciente",
        vertical: "clinical",
        is_default: true,
        position: 0,
        created_by: context.userId,
      })
      .select("id,brand_id,client_id,name,description,vertical,is_default,position")
      .single();
    if (error) throw error;

    const stagesPayload = CLINICAL_TEMPLATE.map((s, idx) => ({
      pipeline_id: pipe!.id,
      brand_id: data.brandId,
      label: s.label,
      color: s.color,
      position: idx,
      is_won: !!s.is_won,
    }));
    const { error: sErr } = await context.supabase.from("crm_pipeline_stages").insert(stagesPayload);
    if (sErr) throw sErr;

    return pipe as CrmPipeline;
  });

export const getCrmBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ pipelineId: z.string().uuid(), brandId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<CrmBoard> => {
    const { data: pipe, error: pErr } = await context.supabase
      .from("crm_pipelines")
      .select("id,brand_id,client_id,name,description,vertical,is_default,position")
      .eq("id", data.pipelineId)
      .eq("brand_id", data.brandId)
      .single();
    if (pErr) throw pErr;

    const [{ data: stages }, { data: deals }] = await Promise.all([
      context.supabase
        .from("crm_pipeline_stages")
        .select("id,pipeline_id,label,color,position,is_won,is_lost")
        .eq("pipeline_id", data.pipelineId)
        .order("position", { ascending: true }),
      context.supabase
        .from("crm_deals")
        .select(
          "id,pipeline_id,stage_id,brand_id,client_id,contact_name,contact_initials,service,owner_name,amount_cents,currency,whatsapp,status,position,notes,created_at,updated_at",
        )
        .eq("pipeline_id", data.pipelineId)
        .order("position", { ascending: true }),
    ]);

    return {
      pipeline: pipe as CrmPipeline,
      stages: (stages ?? []) as CrmStage[],
      deals: (deals ?? []) as CrmDeal[],
    };
  });

export const createCrmDealFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      pipelineId: z.string().uuid(),
      stageId: z.string().uuid(),
      brandId: z.string().uuid(),
      clientId: z.string().uuid(),
      contactName: z.string().min(1).max(120),
      service: z.string().max(120).optional(),
      ownerName: z.string().max(120).optional(),
      amountCents: z.number().int().nonnegative().optional(),
      whatsapp: z.string().max(40).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const initials = data.contactName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");

    const { data: maxRow } = await context.supabase
      .from("crm_deals")
      .select("position")
      .eq("stage_id", data.stageId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = (maxRow?.[0]?.position ?? -1) + 1;

    const { data: deal, error } = await context.supabase
      .from("crm_deals")
      .insert({
        pipeline_id: data.pipelineId,
        stage_id: data.stageId,
        brand_id: data.brandId,
        client_id: data.clientId,
        contact_name: data.contactName,
        contact_initials: initials,
        service: data.service ?? null,
        owner_name: data.ownerName ?? null,
        amount_cents: data.amountCents ?? 0,
        whatsapp: data.whatsapp ?? null,
        position: nextPos,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return deal as CrmDeal;
  });

export const moveCrmDealFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      dealId: z.string().uuid(),
      toStageId: z.string().uuid(),
      position: z.number().int().nonnegative(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crm_deals")
      .update({ stage_id: data.toStageId, position: data.position })
      .eq("id", data.dealId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCrmDealFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ dealId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crm_deals").delete().eq("id", data.dealId);
    if (error) throw error;
    return { ok: true };
  });

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function stageDotClass(color: CrmStageColor): string {
  switch (color) {
    case "sky": return "bg-sky-400";
    case "violet": return "bg-violet-400";
    case "amber": return "bg-amber-400";
    case "emerald": return "bg-emerald-400";
    case "rose": return "bg-rose-400";
    case "indigo": return "bg-indigo-400";
    case "cyan": return "bg-cyan-400";
    default: return "bg-foreground/70";
  }
}