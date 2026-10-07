import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { assertPtBrPayload, withPtBr } from "@/lib/ai-language";
import { classifyAiError, FAILURE_MESSAGE_PT } from "@/lib/ai-failures.server";
import { newLeaseOwner } from "@/lib/ai-job-lease";
import { getBrandAiModelAdmin } from "@/lib/ai-provider.server";
import { callRpc } from "@/lib/supabase-rpc";

const LEASE_SECONDS = 180;
const HEARTBEAT_MS = 45_000;

export const CopilotInputSchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  pipelineId: z.string().uuid().nullable(),
  briefing: z.string().trim().min(4).max(4000),
  channels: z.array(z.enum(["instagram", "tiktok", "linkedin"])).min(1).max(3),
  contentType: z.enum(["reel", "carousel", "image", "short_copy"]),
  tone: z.string().trim().max(200).optional(),
  autoInject: z.boolean().default(true),
});

export type CopilotInput = z.infer<typeof CopilotInputSchema>;

const OutputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(20),
  hashtags: z.array(z.string().trim().min(1)).min(4).max(8),
});

const TYPE_LABEL: Record<CopilotInput["contentType"], string> = {
  reel: "Roteiro de Reel (gancho, desenvolvimento e CTA)",
  carousel: "Carrossel (5 a 8 slides, cada um com título e texto)",
  image: "Imagem estática (direção visual, texto na imagem e legenda)",
  short_copy: "Legenda curta (gancho, desenvolvimento e CTA)",
};

export function parseCopilotOutput(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start > 0 && end > start) candidates.push(cleaned.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = OutputSchema.safeParse(JSON.parse(candidate));
      if (!parsed.success) continue;
      const output = {
        ...parsed.data,
        hashtags: parsed.data.hashtags.map((tag) => tag.replace(/^#+/, "").trim()),
      };
      assertPtBrPayload(output, "Copilot");
      return output;
    } catch {
      // Outro envelope determinístico pode ser tentado; texto bruto nunca vira sucesso.
    }
  }
  throw new Error("ai_invalid_output: Copilot retornou uma resposta fora do contrato.");
}

async function stillOwnsLease(supabase: SupabaseClient, jobId: string, owner: string) {
  const { data, error } = await supabase
    .from("ai_jobs")
    .select("lease_owner, status")
    .eq("id", jobId)
    .maybeSingle();
  return !error && data?.lease_owner === owner && data.status === "running";
}

export async function runCopilotJob(params: {
  jobId: string;
  userId: string;
  input: CopilotInput;
  supabase: SupabaseClient<Database>;
}) {
  const { jobId, userId, input, supabase } = params;
  const owner = newLeaseOwner("copilot");
  const { data: claimed, error: claimError } = await callRpc(supabase, "ai_job_claim_lease", {
    _job_id: jobId,
    _owner: owner,
    _lease_seconds: LEASE_SECONDS,
  });
  // A failed claim may have committed remotely: never update a job we do not own.
  if (claimError) throw new Error("ai_job_claim_failed: não foi possível confirmar a execução do Copilot.");
  if (claimed !== true) return;

  const patch = (fields: Partial<Database["public"]["Tables"]["ai_jobs"]["Update"]>) =>
    supabase.from("ai_jobs").update(fields).eq("id", jobId).eq("lease_owner", owner);

  const heartbeat = setInterval(() => {
    void callRpc(supabase, "ai_job_heartbeat", {
      _job_id: jobId,
      _owner: owner,
      _lease_seconds: LEASE_SECONDS,
    }).then(({ error }) => { if (error) console.error("[copilot] heartbeat falhou", jobId); }).catch(() => console.error("[copilot] heartbeat falhou", jobId));
  }, HEARTBEAT_MS);

  try {
    await patch({
      status: "running",
      started_at: new Date().toISOString(),
      progress: 10,
      step_label: "Lendo o contexto da marca",
    });

    const [{ data: client }, { data: voice }] = await Promise.all([
      supabase.from("clients").select("brand_id, name, niche, tone_of_voice").eq("id", input.clientId).maybeSingle(),
      supabase
        .from("brand_voice_cards")
        .select("data")
        .eq("client_id", input.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!client || client.brand_id !== input.brandId) throw new Error("Escopo do cliente inválido.");

    if (input.pipelineId) {
      const { data: pipeline } = await supabase
        .from("content_pipelines")
        .select("id, brand_id, client_id")
        .eq("id", input.pipelineId)
        .maybeSingle();
      if (!pipeline || pipeline.brand_id !== input.brandId || pipeline.client_id !== input.clientId) {
        throw new Error("Escopo do pipeline inválido.");
      }
    }

    const brandContext = [
      client.name && `Conta: ${client.name}`,
      client.niche && `Nicho: ${client.niche}`,
      (input.tone || client.tone_of_voice) && `Tom de voz: ${input.tone || client.tone_of_voice}`,
      voice?.data && `Cartão de voz: ${JSON.stringify(voice.data).slice(0, 800)}`,
    ].filter(Boolean).join("\n");

    await patch({ progress: 35, step_label: "Criando conteúdo com IA" });
    const { model } = await getBrandAiModelAdmin(input.brandId, "text", "operational", {
      agent: "copilot.job",
      clientId: input.clientId,
      userId,
    });
    const { text } = await generateText({
      model,
      maxRetries: 0,
      system: withPtBr([
        "Você é especialista em conteúdo para redes sociais e estratégia de marca.",
        "Produza uma única versão pronta para uso, sem comentários sobre o processo.",
        "Responda apenas com JSON válido no formato:",
        '{"title":"texto","content":"texto em markdown","hashtags":["tag"]}',
      ].join(" ")),
      prompt: [
        `Tipo de entrega: ${TYPE_LABEL[input.contentType]}`,
        `Canais: ${input.channels.join(", ")}`,
        brandContext ? `Contexto da marca:\n${brandContext}` : "",
        `Briefing:\n${input.briefing}`,
        "O título deve ter até 80 caracteres. Forneça de 4 a 8 hashtags sem #.",
      ].filter(Boolean).join("\n\n"),
    });
    const output = parseCopilotOutput(text ?? "");
    if (!(await stillOwnsLease(supabase, jobId, owner))) return;

    let postId: string | null = null;
    if (input.autoInject && input.pipelineId) {
      await patch({ progress: 80, step_label: "Adicionando à produção" });
      const { data: firstStage } = await supabase
        .from("content_pipeline_stages")
        .select("id")
        .eq("pipeline_id", input.pipelineId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!firstStage) throw new Error("O pipeline não possui etapas configuradas.");

      const { data: existing } = await supabase
        .from("posts")
        .select("id")
        .eq("source_ai_job_id", jobId)
        .maybeSingle();
      if (existing) {
        postId = existing.id;
      } else {
        const { data: maxRows } = await supabase
          .from("posts")
          .select("position")
          .eq("stage_id", firstStage.id)
          .order("position", { ascending: false })
          .limit(1);
        const copy = `${output.content}\n\n${output.hashtags.map((tag) => `#${tag}`).join(" ")}`;
        const { data: post, error } = await supabase
          .from("posts")
          .insert({
            brand_id: input.brandId,
            client_id: input.clientId,
            pipeline_id: input.pipelineId,
            stage_id: firstStage.id,
            source_ai_job_id: jobId,
            title: output.title,
            copy,
            channels: input.channels,
            stage: "idea",
            position: Number(maxRows?.[0]?.position ?? -1) + 1024,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) throw error;
        postId = post.id;
      }
    }

    await patch({
      status: "succeeded",
      progress: 100,
      step_label: null,
      finished_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      result: { ...output, postId, injected: Boolean(postId) },
      target_route: postId ? "/content" : null,
    });
  } catch (error) {
    const { kind } = classifyAiError(error);
    await patch({
      status: "failed",
      error: FAILURE_MESSAGE_PT[kind]?.title ?? FAILURE_MESSAGE_PT.unknown.title,
      finished_at: new Date().toISOString(),
      step_label: null,
      lease_owner: null,
      lease_expires_at: null,
    });
  } finally {
    clearInterval(heartbeat);
  }
}