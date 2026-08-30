import { createFileRoute } from "@tanstack/react-router";
import { guardClientScope } from "@/lib/http-scope.server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { describeProviderAttempts } from "@/lib/ai-provider.server";
import type { BriefingAnalysis } from "@/lib/briefing-analysis-schema";
import { BRIEFING_OUTPUT_INSTRUCTIONS } from "@/lib/briefing-generation.server";
import { waitUntil } from "@/lib/wait-until.server";
import type { ProviderAttempt } from "@/lib/ai-provider.server";

// Worker que lê um documento (PDF, imagem, DOC) do bucket `brand-documents`,
// extrai o texto principal e sugere campos para o briefing do cliente.

const BodySchema = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  documentId: z.string().uuid(),
  /** Origem informada pela UI — preservada em `briefing_import_runs.source_kind`. */
  sourceKind: z.enum(["document", "transcript"]).optional(),
  /** Reanálise explícita: ignora o reuso por fingerprint. */
  force: z.boolean().optional(),
});



function buildUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type DocumentAiSummary = BriefingAnalysis;




async function runAnalysis(params: {
  token: string;
  input: z.infer<typeof BodySchema>;
  runId: string;
}) {
  const { token, input, runId } = params;
  const supabase = buildUserClient(token);
  const runScope = { id: runId, brand_id: input.brandId, client_id: input.clientId };
  let providerAttempts: ProviderAttempt[] = [];

  const {
    claimImportRun,
    setRunStep,
    setRunModel,
    saveImportProposal,
    failImportRun,
    classifyChange,
  } = await import("@/lib/briefing-import.server");

  const patch = (fields: Record<string, unknown>) =>
    (
      supabase as unknown as {
        from: (t: string) => {
          update: (v: unknown) => { eq: (k: string, v: string) => Promise<unknown> };
        };
      }
    )
      .from("client_documents")
      .update(fields)
      .eq("id", input.documentId);

  // Trava de concorrência: só a primeira execução assume a run.
  const claimed = await claimImportRun(supabase as never, runId).catch(() => true);
  if (!claimed) {
    console.warn("[analyze-document] run já em execução:", runId);
    return;
  }

  try {
    await patch({ ai_status: "running", ai_error: null });
    await setRunStep(supabase as never, runScope, "ingest", "running");


    const { data: doc, error: docErr } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              eq: (
                k: string,
                v: string,
              ) => {
                eq: (
                  k: string,
                  v: string,
                ) => {
                  maybeSingle: () => Promise<{
                    data: { storage_path: string; mime_type: string | null; name: string } | null;
                    error: unknown;
                  }>;
                };
              };
            };
          };
        };
      }
    )
      .from("client_documents")
      .select("storage_path, mime_type, name")
      .eq("id", input.documentId)
      .eq("brand_id", input.brandId)
      .eq("client_id", input.clientId)
      .maybeSingle();
    if (docErr) throw docErr as Error;
    if (!doc) throw new Error("document_not_found");

    const dl = await supabase.storage.from("brand-documents").download(doc.storage_path);
    if (dl.error || !dl.data) throw dl.error ?? new Error("download_failed");
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const mediaType = doc.mime_type ?? "application/octet-stream";
    // Preparação por formato: imagem/PDF seguem inline (Base64 STRING),
    // DOCX/planilhas/texto têm o conteúdo extraído aqui no servidor.
    const { prepareDocumentContent, assertInlinePayload } = await import(
      "@/lib/document-extract.server"
    );
    const prepared = await prepareDocumentContent({ bytes, mediaType, filename: doc.name });
    await setRunStep(supabase as never, runScope, "ingest", "done", {
      inputRef: doc.storage_path,
      output: {
        bytes: bytes.length,
        mediaType,
        mode: prepared.mode,
        note: prepared.note,
        ...(prepared.mode === "text" ? { chars: prepared.text.length } : {}),
      },
    });

    await setRunStep(supabase as never, runScope, "interpret", "running");
    const isTranscript = input.sourceKind === "transcript";
    const system = `Você é um analista sênior de marca. Interprete o material e devolva um JSON estrito em pt-BR, mapeando cada informação para os campos de briefing. Preencha TODAS as propriedades do schema: use null para texto/confiança ausente e [] para evidence/speakers sem itens. Nunca invente dados. Todos os textos devem ser objetivos e prontos para uso no briefing (sem introduções como "o documento diz").${
      isTranscript
        ? ` Este material é uma transcrição de reunião: identifique os participantes citados e, quando o contexto permitir, infira o papel de cada um (cliente, gestor, usuário, fornecedor etc.). Nunca invente nomes, cargos ou identidades que não apareçam no material — deixe o papel como desconhecido quando não houver evidência.`
        : ""
    }`;

    const taskPrompt = `Documento: ${doc.name}\n\nSua tarefa:\n1) ${prepared.mode === "text" ? "O texto já foi extraído pelo sistema; devolva `extracted_text` como null e não o repita." : "Extraia somente os trechos essenciais (até 4000 caracteres) para `extracted_text`."}\n2) Classifique o tipo em \`material_type\` (ex.: "Brandbook", "Manual de marca", "Pesquisa", "Deck comercial", "Transcrição de reunião").\n3) Faça um resumo executivo em até 400 caracteres.\n4) Mapeie cada campo de \`briefing\` com o que estiver explícito. Para \`hashtags\`, devolva array de strings sem o "#".\n5) Para cada campo proposto, registre uma única evidência literal curta e o conflito em \`evidence\`.\n6) Atribua \`confidence\` de 0 a 1 ou null. \`evidence\` e \`speakers\` devem ser arrays, mesmo quando vazios.\n${BRIEFING_OUTPUT_INSTRUCTIONS}`;

    // Payload multimodal montado conforme o contrato real do provider:
    // `file`/`image` recebem SOMENTE string Base64 + mediaType separado.
    const content: Array<
      | { type: "text"; text: string }
      | { type: "file"; data: string; mediaType: string; filename?: string }
    > = [{ type: "text", text: taskPrompt }];
    if (prepared.mode === "inline") {
      assertInlinePayload({ mediaType: prepared.mediaType, base64: prepared.base64 });
      content.push({
        type: "file",
        data: prepared.base64,
        mediaType: prepared.mediaType,
        filename: doc.name,
      });
    } else {
      content.push({
        type: "text",
        text: `Conteúdo extraído do arquivo (${prepared.note})\n\n${prepared.text}`,
      });
    }

    const { generateBriefingAnalysis } = await import("@/lib/briefing-ai-executor.server");
    const generated = await generateBriefingAnalysis({
      brandId: input.brandId,
      usage: { agent: "document.analyze", clientId: input.clientId ?? null },
      system,
      messages: [{ role: "user", content }],
    });
    const summary: DocumentAiSummary = generated.analysis;
    providerAttempts = generated.attempts;
    const effective = { provider: generated.provider, model: generated.model };
    await setRunModel(supabase as never, runId, effective);

    await setRunStep(supabase as never, runScope, "interpret", "done", {
      output: {
        material_type: summary.material_type,
        confidence: summary.confidence,
        provider_attempts: describeProviderAttempts(providerAttempts),
      },
    });

    await patch({
      ai_status: "done",
      ai_model: effective.model,
      ai_error: null,
      extracted_text: prepared.mode === "text" ? prepared.text : (summary.extracted_text ?? null),
      ai_summary: summary as unknown as Record<string, unknown>,
      analyzed_at: new Date().toISOString(),
    });

    // Diff contra o briefing canônico atual → proposta campo a campo.
    await setRunStep(supabase as never, runScope, "diff", "running");
    const { loadCanonicalBriefing } = await import("@/lib/briefing-source.server");
    const canonical = await loadCanonicalBriefing(supabase as never, {
      brandId: input.brandId,
      clientId: input.clientId,
    });
    const current = (canonical.hub ?? {}) as Record<string, unknown>;
    const evidenceByField = new Map(summary.evidence.map((e) => [e.field, e] as const));
    const changes = Object.entries(summary.briefing).map(([field, proposed]) => {
      const evidence = evidenceByField.get(field);
      return {
        field,
        currentValue: current[field] ?? null,
        proposedValue: proposed,
        action: classifyChange(current[field] ?? null, proposed),
        confidence: evidence?.confidence ?? summary.confidence ?? null,
        evidence: {
          source: input.sourceKind === "transcript" ? "transcript" : "document",
          document_id: input.documentId,
          document_name: doc.name,
          excerpt: evidence?.excerpt ?? null,
          conflict: evidence?.conflict === true,
        },
      };
    });
    await setRunStep(supabase as never, runScope, "diff", "done", { output: { fields: changes.length } });

    await saveImportProposal(supabase as never, runScope, {
      changes,
      summary: summary.executive_summary ?? null,
      confidence: summary.confidence ?? null,
      ...(isTranscript ? { speakers: summary.speakers } : {}),
    });
    await setRunStep(supabase as never, runScope, "propose", "done", {
      output: { material_type: summary.material_type },
    });
  } catch (err) {
    const baseTechnical = err instanceof Error ? err.message : String(err);
    const trace = describeProviderAttempts(providerAttempts);
    const technical = trace ? `${baseTechnical}\nProvider attempts: ${trace}` : baseTechnical;
    // Erro técnico completo fica no log e no step da execução; o usuário vê
    // uma mensagem amigável.
    console.error("[analyze-document] failed:", technical, err);
    const { friendlyAnalysisError } = await import("@/lib/briefing-import-ui");
    const friendly = friendlyAnalysisError(err) || "Não foi possível analisar este material.";
    await setRunStep(supabase as never, runScope, "interpret", "failed", {
      error: technical.slice(0, 2000),
      errorKind: "analysis",
    }).catch(() => undefined);
    await patch({ ai_status: "failed", ai_error: friendly.slice(0, 500) });
    await failImportRun(supabase as never, runScope, {
      message: friendly,
      kind: "analysis",
    }).catch(() => undefined);
  }

}


export const Route = createFileRoute("/api/jobs/analyze-document")({
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
        const { data: claims } = await supabase.auth.getClaims(token).catch(() => ({ data: null }));
        let userId = claims?.claims?.sub as string | undefined;
        if (!userId) {
          const { data: userData } = await supabase.auth.getUser(token);
          userId = userData?.user?.id;
        }
        if (!userId) return new Response("Unauthorized", { status: 401 });

        // Fase 2: escopo de cliente validado antes de baixar o documento.
        const denied = await guardClientScope(supabase, userId, parsed.data.clientId);
        if (denied) return denied;

        // Metadados do arquivo → fingerprint estável para idempotência.
        const { data: meta } = await (
          supabase as unknown as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (
                  k: string,
                  v: string,
                ) => {
                  eq: (
                    k: string,
                    v: string,
                  ) => {
                    eq: (
                      k: string,
                      v: string,
                    ) => {
                      maybeSingle: () => Promise<{
                        data: {
                          storage_path: string;
                          size_bytes: number | null;
                          mime_type: string | null;
                        } | null;
                      }>;
                    };
                  };
                };
              };
            };
          }
        )
          .from("client_documents")
          .select("storage_path, size_bytes, mime_type")
          .eq("id", parsed.data.documentId)
          .eq("brand_id", parsed.data.brandId)
          .eq("client_id", parsed.data.clientId)
          .maybeSingle();
        if (!meta) return new Response("Not found", { status: 404 });

        const { buildInputFingerprint, startImportRun } = await import(
          "@/lib/briefing-import.server"
        );
        const fingerprint = await buildInputFingerprint({
          sourceKind: "document",
          documentPath: meta.storage_path,
          documentSize: meta.size_bytes,
          documentMime: meta.mime_type,
        });
        const { run, reused } = await startImportRun(supabase as never, {
          brandId: parsed.data.brandId,
          clientId: parsed.data.clientId,
          userId,
          // A UI pode marcar transcrição; o fingerprint segue o arquivo.
          sourceKind: parsed.data.sourceKind ?? "document",
          documentId: parsed.data.documentId,
          inputFingerprint: fingerprint,
          force: parsed.data.force === true,
        });


        // Reuso: já existe execução viva para o mesmo arquivo — não gasta IA.
        if (reused && run.status !== "queued") {
          return new Response(JSON.stringify({ ok: true, runId: run.id, reused: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        await (
          supabase as unknown as {
            from: (t: string) => {
              update: (v: unknown) => { eq: (k: string, v: string) => Promise<unknown> };
            };
          }
        )
          .from("client_documents")
          .update({ ai_status: "queued", ai_error: null })
          .eq("id", parsed.data.documentId);

        waitUntil(runAnalysis({ token, input: parsed.data, runId: run.id }));

        return new Response(JSON.stringify({ ok: true, runId: run.id, reused }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });

      },
    },
  },
});
