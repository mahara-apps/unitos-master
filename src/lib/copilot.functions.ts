import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const CHANNELS = ["instagram", "tiktok", "linkedin"] as const;
const CONTENT_TYPES = ["reel", "carousel", "image", "short_copy"] as const;

const GenerateInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  briefing: z.string().trim().min(4).max(4000),
  channels: z.array(z.enum(CHANNELS)).min(1).max(3),
  contentType: z.enum(CONTENT_TYPES),
  tone: z.string().trim().max(200).optional(),
});

export type GenerateDraftResult = {
  title: string;
  content: string;
  hashtags: string[];
};

const TYPE_LABEL: Record<(typeof CONTENT_TYPES)[number], string> = {
  reel: "Reel Script (hook, beats, CTA)",
  carousel: "Carousel (5-8 slides, each with headline + body)",
  image: "Static Image Prompt (visual description + on-image copy + caption)",
  short_copy: "Short-form Caption Copy (hook + body + CTA)",
};

export const generateContentDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GenerateInput.parse(i))
  .handler(async ({ data, context }): Promise<GenerateDraftResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Pull light brand/customer context to ground the generation.
    const [{ data: client }, { data: voice }] = await Promise.all([
      context.supabase
        .from("clients")
        .select("name, niche, tone_of_voice")
        .eq("id", data.clientId)
        .maybeSingle(),
      context.supabase
        .from("brand_voice_cards")
        .select("payload")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const brandCtx = [
      client?.name && `Account: ${client.name}`,
      client?.niche && `Niche: ${client.niche}`,
      (data.tone || client?.tone_of_voice) && `Tone of voice: ${data.tone || client?.tone_of_voice}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      voice?.payload && `Voice card: ${JSON.stringify((voice as any).payload).slice(0, 800)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const system = [
      "You are an elite social-media copywriter and brand strategist.",
      "Write in the same language as the user's briefing (detect it from the briefing text).",
      "Produce a single, ready-to-ship draft — no meta commentary, no options list.",
      "Return STRICT JSON only, no markdown fences, matching:",
      `{"title": string, "content": string (markdown), "hashtags": string[] }`,
      "The 'content' field is the deliverable itself in clean markdown.",
    ].join(" ");

    const userMsg = [
      `Deliverable type: ${TYPE_LABEL[data.contentType]}`,
      `Target channels: ${data.channels.join(", ")}`,
      brandCtx ? `\nBrand context:\n${brandCtx}` : "",
      `\nBriefing / objective:\n${data.briefing}`,
      "\nRules:",
      "- Title: <= 80 chars, punchy, no emojis at start.",
      "- Content: format for the deliverable type; keep it channel-appropriate.",
      "- Hashtags: 4 to 8, no leading # in the array items.",
    ].join("\n");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const { text } = await generateText({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    });

    // Robust parse — strip fences if the model added them.
    const cleaned = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    let parsed: { title?: unknown; content?: unknown; hashtags?: unknown } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          /* fall through */
        }
      }
    }

    const title = typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 160)
      : data.briefing.split("\n")[0].slice(0, 120);
    const content = typeof parsed.content === "string" && parsed.content.trim()
      ? parsed.content.trim()
      : cleaned;
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .filter((h): h is string => typeof h === "string")
          .map((h) => h.replace(/^#+/, "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];

    return { title, content, hashtags };
  });

const InjectInput = z.object({
  brandId: z.string().uuid(),
  clientId: z.string().uuid(),
  pipelineId: z.string().uuid(),
  title: z.string().min(1).max(160),
  copy: z.string().min(1).max(8000),
  channels: z.array(z.enum(CHANNELS)).min(1).max(3),
});

export const injectDraftIntoPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InjectInput.parse(i))
  .handler(async ({ data, context }) => {
    // Resolve the first stage of the target pipeline.
    const { data: firstStage, error: sErr } = await context.supabase
      .from("content_pipeline_stages")
      .select("id, key")
      .eq("pipeline_id", data.pipelineId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!firstStage) throw new Error("Pipeline has no stages configured.");

    const { data: maxRow } = await context.supabase
      .from("posts")
      .select("position")
      .eq("stage_id", firstStage.id)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((maxRow?.[0]?.position ?? -1) as number) + 1024;

    const { data: post, error } = await context.supabase
      .from("posts")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        pipeline_id: data.pipelineId,
        stage_id: firstStage.id,
        title: data.title.trim(),
        copy: data.copy,
        channels: data.channels,
        stage: "idea",
        position: nextPos,
        created_by: context.userId,
      })
      .select("id, title, stage_id, pipeline_id")
      .single();
    if (error) throw error;
    return { post };
  });