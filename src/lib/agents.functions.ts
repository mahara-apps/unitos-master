import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AgentPromptRow = {
  agent_id: string;
  agent_name: string;
  system_prompt: string;
  required_fields: string[] | null;
  updated_at: string;
};

export type AgentJobRow = {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  progress: number | null;
  step_label: string | null;
  error: string | null;
  client_id: string | null;
  brand_id: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export const listAgentPromptsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgentPromptRow[]> => {
    const { data, error } = await context.supabase
      .from("agent_prompts")
      .select("agent_id, agent_name, system_prompt, required_fields, updated_at")
      .order("agent_name", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      agent_id: String(r.agent_id),
      agent_name: String(r.agent_name),
      system_prompt: String(r.system_prompt ?? ""),
      required_fields: Array.isArray(r.required_fields)
        ? (r.required_fields as string[])
        : null,
      updated_at: String(r.updated_at),
    }));
  });

export const listAgentJobsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<AgentJobRow[]> => {
    let q = context.supabase
      .from("ai_jobs")
      .select(
        "id, kind, title, status, progress, step_label, error, client_id, brand_id, started_at, finished_at, created_at",
      )
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as AgentJobRow[];
  });

export type BrandVolumetry = {
  postsPerMonth: number;
  channels: string[];
};

export const getBrandVolumetryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<BrandVolumetry> => {
    const { data: row } = await context.supabase
      .from("clients")
      .select("brand_hub")
      .eq("id", data.clientId)
      .maybeSingle();
    const hub = ((row?.brand_hub ?? {}) as Record<string, unknown>) || {};
    const vol = (hub.volumetria ?? {}) as Record<string, unknown>;
    const raw = vol.postsPerMonth ?? vol.posts_per_month ?? vol.qty ?? 12;
    const n = Number(raw);
    const channels = Array.isArray(hub.canais)
      ? (hub.canais as string[])
      : Array.isArray(vol.channels)
        ? (vol.channels as string[])
        : ["instagram"];
    return {
      postsPerMonth: Number.isFinite(n) && n > 0 ? Math.min(60, Math.round(n)) : 12,
      channels,
    };
  });