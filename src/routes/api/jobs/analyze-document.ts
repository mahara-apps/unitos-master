import { createFileRoute } from "@tanstack/react-router";
import { guardClientScope } from "@/lib/http-scope.server";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { getBrandAiModelAdmin } from "@/lib/ai-provider.server";
import { waitUntil } from "@/lib/wait-until.server";

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

const AiSummarySchema = z.object({
  document_type: z.string().nullable(),
  executive_summary: z.string().nullable(),
  extracted_text: z.string().nullable(),
  briefing: z.object({
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
  }),
  confidence: z.number().min(0).max(1),
});

export type DocumentAiSummary = z.infer<typeof AiSummarySchema>;

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

async function runAnalysis(params: {
  token: string;
  input: z.infer<typeof BodySchema>;
  runId: string;
}) {
  const { token, input, runId } = params;
  const supabase = buildUserClient(token);
  const runScope = { id: runId, brand_id: input.brandId, client_id: input.clientId };

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
    const base64 = uint8ToBase64(bytes);
    await setRunStep(supabase as never, runScope, "ingest", "done", {
      inputRef: doc.storage_path,
      output: { bytes: bytes.length, mediaType },
    });

    await setRunStep(supabase as never, runScope, "interpret", "running");
    const { model, modelId, provider } = await getBrandAiModelAdmin(
      input.brandId,
      "text",
      "operational",
      {
        agent: "document.analyze",
        clientId: input.clientId ?? null,
      },
    );
    // Modelo/provedor REAIS da execução (antes ficava hardcoded).
    await setRunModel(supabase as never, runId, { model: modelId, provider });

    const system = `Você é um analista sênior de marca. Interprete o documento e devolva um JSON estrito em pt-BR, mapeando cada informação para os campos de briefing. Use null quando o campo não estiver claramente descrito. Nunca invente dados. Todos os textos devem ser objetivos e prontos para uso no briefing (sem introduções como "o documento diz").`;

    const userPrompt = `Documento: ${doc.name}\n\nSua tarefa:\n1) Extraia o texto principal (até 8000 caracteres) para \`extracted_text\`.\n2) Classifique o tipo em \`document_type\` (ex.: "Brandbook", "Manual de marca", "Pesquisa", "Deck comercial").\n3) Faça um resumo executivo em até 400 caracteres.\n4) Mapeie cada campo de \`briefing\` com o que estiver explícito. Para \`hashtags\`, devolva array de strings sem o "#".\n5) Atribua um \`confidence\` (0 a 1) refletindo quão bem o documento cobriu o briefing.`;

    let summary: DocumentAiSummary;
    try {
      const { output } = await generateText({
        model,
        system,
        output: Output.object({ schema: AiSummarySchema }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              mediaType.startsWith("image/")
                ? { type: "image", image: `data:${mediaType};base64,${base64}` }
                : { type: "file", data: base64, mediaType, filename: doc.name },
            ],
          },
        ],
      });
      summary = output;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        throw new Error(
          "A IA não conseguiu estruturar o documento. Tente novamente ou envie um arquivo mais legível.",
        );
      }
      throw err;
    }
    await setRunStep(supabase as never, runScope, "interpret", "done", {
      output: { document_type: summary.document_type, confidence: summary.confidence },
    });

    await patch({
      ai_status: "done",
      ai_model: modelId,
      ai_error: null,
      extracted_text: summary.extracted_text ?? null,
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
    const changes = Object.entries(summary.briefing).map(([field, proposed]) => ({
      field,
      currentValue: current[field] ?? null,
      proposedValue: proposed,
      action: classifyChange(current[field] ?? null, proposed),
      confidence: summary.confidence ?? null,
      evidence: {
        source: "document",
        document_id: input.documentId,
        document_name: doc.name,
      },
    }));
    await setRunStep(supabase as never, runScope, "diff", "done", { output: { fields: changes.length } });

    await saveImportProposal(supabase as never, runScope, {
      changes,
      summary: summary.executive_summary ?? null,
      confidence: summary.confidence ?? null,
    });
    await setRunStep(supabase as never, runScope, "propose", "done", {
      output: { document_type: summary.document_type },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-document] failed:", message);
    await patch({ ai_status: "failed", ai_error: message.slice(0, 500) });
    await failImportRun(supabase as never, runScope, {
      message,
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
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
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
          sourceKind: "document",
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
