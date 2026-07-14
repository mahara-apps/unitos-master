import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText } from "ai";
import { renderPrompt } from "./agent-variables";

export type AgentPromptRow = {
  agent_id: string;
  agent_name: string;
  system_prompt: string;
  default_prompt: string;
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
      .select("agent_id, agent_name, system_prompt, default_prompt, required_fields, updated_at")
      .order("agent_name", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      agent_id: String(r.agent_id),
      agent_name: String(r.agent_name),
      system_prompt: String(r.system_prompt ?? ""),
      default_prompt: String(r.default_prompt ?? r.system_prompt ?? ""),
      required_fields: Array.isArray(r.required_fields)
        ? (r.required_fields as string[])
        : null,
      updated_at: String(r.updated_at),
    }));
  });

export const updateAgentPromptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        agentId: z.string().min(1),
        systemPrompt: z.string().min(1).max(20000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_prompts")
      .update({ system_prompt: data.systemPrompt })
      .eq("agent_id", data.agentId);
    if (error) throw error;
    return { ok: true };
  });

export const resetAgentPromptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ agentId: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error: selErr } = await context.supabase
      .from("agent_prompts")
      .select("default_prompt")
      .eq("agent_id", data.agentId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row?.default_prompt) throw new Error("Agente não possui prompt padrão.");
    const { error } = await context.supabase
      .from("agent_prompts")
      .update({ system_prompt: row.default_prompt })
      .eq("agent_id", data.agentId);
    if (error) throw error;
    return { systemPrompt: row.default_prompt as string };
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

/**
 * Playground execution for an agent prompt.
 * Uses the agent's current system prompt, injects resolved variables +
 * runtime overrides, and calls the Lovable AI Gateway. Returns the raw
 * text response so the user can inspect exactly what the prompt produces
 * today.
 */
export const runAgentPlaygroundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        agentId: z.string().min(1),
        userInput: z.string().max(8000).optional(),
        variables: z.record(z.string(), z.string()).optional(),
        model: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurado.");

    const { data: row, error } = await context.supabase
      .from("agent_prompts")
      .select("system_prompt")
      .eq("agent_id", data.agentId)
      .maybeSingle();
    if (error) throw error;
    if (!row?.system_prompt) throw new Error("Prompt do agente não encontrado.");

    const rendered = renderPrompt(
      String(row.system_prompt),
      data.variables ?? {},
      "(não informado)",
    );
    const model = data.model || "google/gemini-2.5-flash";
    const gateway = createLovableAiGatewayProvider(key);

    const started = Date.now();
    const result = await generateText({
      model: gateway(model),
      system: rendered,
      prompt: data.userInput?.trim() || "Execute o agente com o contexto acima.",
    });
    const ms = Date.now() - started;

    return {
      output: result.text,
      usage: result.usage,
      model,
      ms,
    };
  });