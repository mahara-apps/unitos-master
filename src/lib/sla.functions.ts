import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SlaScope = "project" | "user_role" | "agent";

export type SlaRuleRow = {
  id: string;
  brand_id: string;
  scope: SlaScope;
  scope_ref: string | null;
  project_id: string | null;
  target_hours: number;
  is_active: boolean;
  updated_at: string;
};

export type StageSlaRow = {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  name: string;
  position: number;
  sla_hours: number | null;
};

const BrandInput = z.object({ brandId: z.string().uuid() });

export const listSlaRulesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BrandInput.parse(i))
  .handler(async ({ data, context }): Promise<SlaRuleRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("sla_rules")
      .select("id, brand_id, scope, scope_ref, project_id, target_hours, is_active, updated_at")
      .eq("brand_id", data.brandId)
      .order("scope", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as SlaRuleRow[];
  });

const UpsertInput = z.object({
  brandId: z.string().uuid(),
  scope: z.enum(["project", "user_role", "agent"]),
  scopeRef: z.string().max(120).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  targetHours: z.number().int().min(1).max(24 * 365),
  isActive: z.boolean().default(true),
});

export const upsertSlaRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertInput.parse(i))
  .handler(async ({ data, context }) => {
    const scopeRef = data.scope === "project" ? null : data.scopeRef ?? null;
    const projectId = data.projectId ?? null;

    const q = context.supabase
      .from("sla_rules")
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("scope", data.scope);
    if (scopeRef == null) q.is("scope_ref", null);
    else q.eq("scope_ref", scopeRef);
    if (projectId == null) q.is("project_id", null);
    else q.eq("project_id", projectId);

    const { data: found, error: findErr } = await q.maybeSingle();
    if (findErr) throw findErr;

    if (found?.id) {
      const { error } = await context.supabase
        .from("sla_rules")
        .update({
          target_hours: data.targetHours,
          is_active: data.isActive,
          updated_by: context.userId,
        })
        .eq("id", found.id);
      if (error) throw error;
      return { id: found.id };
    }

    const { data: ins, error } = await context.supabase
      .from("sla_rules")
      .insert({
        brand_id: data.brandId,
        scope: data.scope,
        scope_ref: scopeRef,
        project_id: projectId,
        target_hours: data.targetHours,
        is_active: data.isActive,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: ins.id };
  });

export const deleteSlaRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sla_rules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Lista estágios de todos os pipelines da marca com o SLA atual em dias. */
export const listStageSlasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BrandInput.parse(i))
  .handler(async ({ data, context }): Promise<StageSlaRow[]> => {
    const { data: pipes, error: pErr } = await context.supabase
      .from("content_pipelines")
      .select("id, name")
      .eq("brand_id", data.brandId);
    if (pErr) throw pErr;
    const ids = (pipes ?? []).map((p) => p.id);
    if (ids.length === 0) return [];
    const nameById = new Map(pipes!.map((p) => [p.id, p.name as string]));
    const { data: stages, error } = await context.supabase
      .from("content_pipeline_stages")
      .select("id, pipeline_id, label, position, sla_days, sla_hours")
      .in("pipeline_id", ids)
      .order("pipeline_id", { ascending: true })
      .order("position", { ascending: true });
    if (error) throw error;
    return (stages ?? []).map((s) => {
      const h = (s.sla_hours as number | null) ?? null;
      const d = (s.sla_days as number | null) ?? null;
      const hours = h != null && h > 0 ? h : d != null && d > 0 ? d * 24 : null;
      return {
      id: s.id as string,
      pipeline_id: s.pipeline_id as string,
      pipeline_name: nameById.get(s.pipeline_id as string) ?? "—",
      name: s.label as string,
      position: s.position as number,
        sla_hours: hours,
      };
    });
  });

export const updateStageSlaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ stageId: z.string().uuid(), slaHours: z.number().int().min(0).max(24 * 365).nullable() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const days = data.slaHours == null ? null : Math.max(1, Math.round(data.slaHours / 24));
    const { error } = await context.supabase
      .from("content_pipeline_stages")
      .update({ sla_hours: data.slaHours, sla_days: days })
      .eq("id", data.stageId);
    if (error) throw error;
    return { ok: true };
  });

export const listBrandProjectsForSlaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BrandInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("projects")
      .select("id, name")
      .eq("brand_id", data.brandId)
      .neq("status", "archived")
      .order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as Array<{ id: string; name: string }>;
  });

export const listBrandAgentsForSlaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((_: unknown) => ({}))
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_agent_catalog");
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      agent_id: String(r.agent_id),
      agent_name: String(r.agent_name),
    }));
  });

export const ROLE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "manager", label: "Manager" },
  { id: "editor", label: "Editor" },
  { id: "designer", label: "Designer" },
  { id: "client", label: "Cliente" },
];