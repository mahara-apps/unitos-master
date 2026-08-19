import { createFileRoute } from "@tanstack/react-router";
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

async function runAnalysis(params: { token: string; input: z.infer<typeof BodySchema> }) {
  const { token, input } = params;
  const supabase = buildUserClient(token);

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

  try {
    await patch({ ai_status: "running", ai_error: null });

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

    const { model } = await getBrandAiModelAdmin(input.brandId, "text", "operational", {
      agent: "document.analyze",
      clientId: input.clientId ?? null,
    });

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

    await patch({
      ai_status: "done",
      ai_model: "google/gemini-2.5-flash",
      ai_error: null,
      extracted_text: summary.extracted_text ?? null,
      ai_summary: summary as unknown as Record<string, unknown>,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-document] failed:", message);
    await patch({ ai_status: "failed", ai_error: message.slice(0, 500) });
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
        if (!claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

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

        waitUntil(runAnalysis({ token, input: parsed.data }));

        return new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
