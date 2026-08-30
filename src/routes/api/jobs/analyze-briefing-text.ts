import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { getBrandAiModelAdmin } from "@/lib/ai-provider.server";
import { guardClientScope } from "@/lib/http-scope.server";
import { waitUntil } from "@/lib/wait-until.server";

/**
 * Worker de importação a partir de TEXTO (colado, notas, e-mails, transcrição
 * ou texto extraído de docx/planilha no navegador).
 *
 * Reutiliza integralmente a camada de import-execution existente:
 * fingerprint/idempotência (`startImportRun`), claim de concorrência,
 * etapas (`setRunStep`), proposta campo a campo (`saveImportProposal`) e
 * aplicação idempotente via `applyImportRun`. Nada é aplicado aqui.
 */

const BodySchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  text: z.string().min(40).max(400_000),
  sourceKind: z.enum(["paste", "transcript"]).optional(),
  /** Rótulo do material (nomes de arquivos, "Texto colado"). */
  label: z.string().max(300).optional(),
  force: z.boolean().optional(),
});

const BriefingFields = z.object({
  description: z.string().nullable(),
  mission: z.string().nullable(),
  positioning: z.string().nullable(),
  values: z.string().nullable(),
  audience: z.string().nullable(),
  pain_points: z.string().nullable(),
  demographics: z.string().nullable(),
  offer: z.string().nullable(),
  differentials: z.string().nullable(),
  objections: z.string().nullable(),
  journey: z.string().nullable(),
  desires: z.string().nullable(),
  tone_text: z.string().nullable(),
  hashtags: z.array(z.string()).nullable(),
  goals: z.string().nullable(),
});

const AnalysisSchema = z.object({
  executive_summary: z.string().nullable(),
  material_type: z.string().nullable(),
  briefing: BriefingFields,
  /** Evidência por campo: trecho literal do material e se contradiz o atual. */
  evidence: z
    .array(
      z.object({
        field: z.string(),
        excerpt: z.string().nullable(),
        conflict: z.boolean().nullable(),
        confidence: z.number().min(0).max(1).nullable(),
      }),
    )
    .nullable(),
  /** Participantes só quando o material é transcrição e há evidência real. */
  speakers: z
    .array(
      z.object({
        name: z.string().nullable(),
        role: z
          .enum([
            "cliente",
            "gestor",
            "usuario",
            "fornecedor",
            "especialista",
            "interno",
            "indefinido",
          ])
          .nullable(),
        evidence: z.string().nullable(),
        needs_review: z.boolean().nullable(),
      }),
    )
    .nullable(),
  confidence: z.number().min(0).max(1),
});

function buildUserClient(token: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function runTextAnalysis(params: {
  token: string;
  input: z.infer<typeof BodySchema>;
  runId: string;
}) {
  const { token, input, runId } = params;
  const supabase = buildUserClient(token);
  const runScope = { id: runId, brand_id: input.brandId, client_id: input.clientId };
  const isTranscript = (input.sourceKind ?? "paste") === "transcript";

  const { claimImportRun, setRunStep, setRunModel, saveImportProposal, failImportRun, classifyChange } =
    await import("@/lib/briefing-import.server");

  const claimed = await claimImportRun(supabase as never, runId).catch(() => true);
  if (!claimed) return;

  try {
    await setRunStep(supabase as never, runScope, "ingest", "done", {
      output: { chars: input.text.length, label: input.label ?? null },
    });

    await setRunStep(supabase as never, runScope, "interpret", "running");
    const { model, modelId, provider } = await getBrandAiModelAdmin(
      input.brandId,
      "text",
      "operational",
      { agent: "briefing.import.text", clientId: input.clientId ?? null },
    );
    await setRunModel(supabase as never, runId, { model: modelId, provider });

    const { loadCanonicalBriefing } = await import("@/lib/briefing-source.server");
    const canonical = await loadCanonicalBriefing(supabase as never, {
      brandId: input.brandId,
      clientId: input.clientId,
    });
    const current = (canonical.hub ?? {}) as Record<string, unknown>;

    const system = `Você é um analista sênior de marca. Interprete o material recebido e devolva JSON estrito em pt-BR mapeando informações para os campos de briefing. Use null quando o campo não estiver claramente descrito. Nunca invente dados nem participantes. Todos os textos devem ser objetivos e prontos para uso no briefing.`;

    const userPrompt = [
      `Material: ${input.label ?? (isTranscript ? "Transcrição de reunião" : "Texto colado")}`,
      isTranscript
        ? `Este material é uma TRANSCRIÇÃO. Identifique os participantes e seus papéis (cliente, gestor, usuario, fornecedor, especialista, interno) SOMENTE com base em evidência explícita da conversa. Sem evidência suficiente, use role "indefinido" e needs_review = true.`
        : "",
      `\nBRIEFING ATUAL (para cruzamento):\n${JSON.stringify(current).slice(0, 12_000)}`,
      `\nMATERIAL:\n${input.text}`,
      `\nTarefas:
1) Resumo executivo em até 400 caracteres.
2) Classifique o tipo do material em material_type.
3) Preencha \`briefing\` com o que o material sustenta; compare com o briefing atual e proponha valores completos e finais para cada campo que precise mudar. Deixe null o que não tiver base.
4) Em \`evidence\`, para cada campo proposto, informe o trecho literal de origem (excerpt), se contradiz o briefing atual (conflict) e a confiança do campo.
5) \`confidence\` global de 0 a 1.`,
    ]
      .filter(Boolean)
      .join("\n");

    let analysis: z.infer<typeof AnalysisSchema>;
    try {
      const { output } = await generateText({
        model,
        system,
        output: Output.object({ schema: AnalysisSchema }),
        messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
      });
      analysis = output;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        throw new Error(
          "A IA não conseguiu estruturar o material. Revise o conteúdo enviado e tente novamente.",
        );
      }
      throw err;
    }
    await setRunStep(supabase as never, runScope, "interpret", "done", {
      output: { material_type: analysis.material_type, confidence: analysis.confidence },
    });

    await setRunStep(supabase as never, runScope, "diff", "running");
    const evidenceByField = new Map(
      (analysis.evidence ?? []).map((e) => [e.field, e] as const),
    );
    const changes = Object.entries(analysis.briefing).map(([field, proposed]) => {
      const ev = evidenceByField.get(field);
      return {
        field,
        currentValue: current[field] ?? null,
        proposedValue: proposed,
        action: classifyChange(current[field] ?? null, proposed),
        confidence: ev?.confidence ?? analysis.confidence ?? null,
        evidence: {
          source: isTranscript ? "transcript" : "paste",
          label: input.label ?? null,
          excerpt: ev?.excerpt ?? null,
          conflict: ev?.conflict === true,
        },
      };
    });
    await setRunStep(supabase as never, runScope, "diff", "done", {
      output: { fields: changes.length },
    });

    await saveImportProposal(supabase as never, runScope, {
      changes,
      summary: analysis.executive_summary ?? null,
      confidence: analysis.confidence ?? null,
      ...(isTranscript && analysis.speakers ? { speakers: analysis.speakers } : {}),
    });
    await setRunStep(supabase as never, runScope, "propose", "done", {
      output: { material_type: analysis.material_type },
    });
  } catch (err) {
    const technical = err instanceof Error ? err.message : String(err);
    console.error("[analyze-briefing-text] failed:", technical, err);
    const { friendlyAnalysisError } = await import("@/lib/briefing-import-ui");
    const friendly = friendlyAnalysisError(err) || "Não foi possível analisar este material.";
    await setRunStep(supabase as never, runScope, "interpret", "failed", {
      error: technical.slice(0, 2000),
      errorKind: "analysis",
    }).catch(() => undefined);
    await failImportRun(supabase as never, runScope, { message: friendly, kind: "analysis" }).catch(
      () => undefined,
    );
  }

}

export const Route = createFileRoute("/api/jobs/analyze-briefing-text")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);
        if (token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });

        const raw = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          return new Response(JSON.stringify(parsed.error.format()), { status: 400 });
        }

        const supabase = buildUserClient(token);
        // Mesmo padrão do middleware: getClaims pode falhar por cache de JWKS;
        // nesse caso validamos o token direto antes de recusar.
        const { data: claims } = await supabase.auth.getClaims(token).catch(() => ({ data: null }));
        let userId = claims?.claims?.sub as string | undefined;
        if (!userId) {
          const { data: userData } = await supabase.auth.getUser(token);
          userId = userData?.user?.id;
        }
        if (!userId) return new Response("Unauthorized", { status: 401 });


        const denied = await guardClientScope(supabase, userId, parsed.data.clientId);
        if (denied) return denied;

        const { buildInputFingerprint, startImportRun } = await import(
          "@/lib/briefing-import.server"
        );
        const sourceKind = parsed.data.sourceKind ?? "paste";
        const fingerprint = await buildInputFingerprint({
          sourceKind,
          rawText: parsed.data.text,
        });
        const { run, reused } = await startImportRun(supabase as never, {
          brandId: parsed.data.brandId,
          clientId: parsed.data.clientId,
          userId,
          sourceKind,
          rawText: parsed.data.text,
          inputFingerprint: fingerprint,
          force: parsed.data.force === true,
        });

        if (reused && run.status !== "queued") {
          return new Response(JSON.stringify({ ok: true, runId: run.id, reused: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        waitUntil(runTextAnalysis({ token, input: parsed.data, runId: run.id }));

        return new Response(JSON.stringify({ ok: true, runId: run.id, reused }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
