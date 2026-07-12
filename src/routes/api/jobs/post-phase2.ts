import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// Phase 2 — runs Copy + Design Brief for an approved idea post.
// Triggered after the manager approves the idea in the content drawer.
// Updates the post row directly; Realtime broadcasts changes to the board.

const BodySchema = z.object({
  postId: z.string().uuid(),
});

const OPERATIONAL_MODEL = "openai/gpt-5.4-mini";

const CopySchema = z.object({
  title: z.string(),
  content: z.string(),
  hashtags: z.array(z.string()),
});
const DesignSchema = z.object({
  concept: z.string(),
  layout: z.string(),
  palette: z.array(z.string()),
  typography: z.string(),
  on_image_copy: z.string().nullable(),
  reference_notes: z.string().nullable(),
});

function buildUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function runStructured<T extends z.ZodTypeAny>(system: string, prompt: string, schema: T) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: true });
  const model = gateway(OPERATIONAL_MODEL);
  try {
    const res = await generateText({ model, system, prompt, output: Output.object({ schema }) });
    return res.output as z.infer<T>;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const raw = (err.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      return JSON.parse(raw) as z.infer<T>;
    }
    throw err;
  }
}

type ReferenceMedia = { path: string; name?: string; type?: string };

async function runPhase2(params: { jobId: string; token: string; userId: string; postId: string }) {
  const { jobId, token, postId } = params;
  const supabase = buildUserClient(token);
  const patch = (fields: Partial<Database["public"]["Tables"]["ai_jobs"]["Update"]>) =>
    supabase.from("ai_jobs").update(fields).eq("id", jobId);

  try {
    await patch({ status: "running", started_at: new Date().toISOString(), progress: 10, step_label: "Reading post + brand" });

    const { data: post, error: postErr } = await supabase
      .from("posts")
      .select("id, title, copy, channels, brand_id, client_id, reference_media, review_status")
      .eq("id", postId)
      .single();
    if (postErr || !post) throw postErr ?? new Error("Post not found");
    if (post.review_status !== "approved") {
      throw new Error("Post must be approved before Phase 2");
    }

    await patch({ ai_phase: "phase2" } as never);
    await supabase
      .from("posts")
      .update({ ai_phase: "copy_running" } as never)
      .eq("id", postId);

    const [{ data: client }, { data: voice }] = await Promise.all([
      supabase.from("clients").select("name, niche, tone_of_voice").eq("id", post.client_id).maybeSingle(),
      supabase
        .from("brand_voice_cards")
        .select("data")
        .eq("client_id", post.client_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const brandCtx = [
      client?.name && `Account: ${client.name}`,
      client?.niche && `Niche: ${client.niche}`,
      client?.tone_of_voice && `Tone: ${client.tone_of_voice}`,
      voice?.data && `Voice card: ${JSON.stringify(voice.data).slice(0, 800)}`,
    ].filter(Boolean).join("\n");

    const refs = Array.isArray(post.reference_media)
      ? (post.reference_media as unknown as ReferenceMedia[])
      : [];
    const refNames = refs.map((r) => r.name ?? r.path).slice(0, 6).join(", ");

    await patch({ progress: 40, step_label: "Drafting copy" });
    const copy = await runStructured(
      "You are an elite social media copywriter. Respond in the same language as the idea. Return STRICT JSON only.",
      [
        `Idea title: ${post.title}`,
        `Idea hook: ${post.copy ?? ""}`,
        `Channels: ${(post.channels ?? []).join(", ")}`,
        brandCtx ? `\nBrand:\n${brandCtx}` : "",
        refNames ? `\nReference media provided by manager: ${refNames}` : "",
        "\nReturn { title, content (markdown), hashtags: string[] } — 4-8 hashtags without leading #.",
      ].join("\n"),
      CopySchema,
    );

    await patch({ progress: 75, step_label: "Writing design brief" });
    const design = await runStructured(
      "You are a senior art director. Write a concise, executable design brief. Return STRICT JSON only.",
      [
        `Copy title: ${copy.title}`,
        `Copy body:\n${copy.content}`,
        brandCtx ? `\nBrand:\n${brandCtx}` : "",
        refNames ? `\nReference media the manager attached: ${refNames}` : "",
        "\nReturn { concept, layout, palette (hex codes), typography, on_image_copy, reference_notes }.",
      ].join("\n"),
      DesignSchema,
    );

    const finalCopy = copy.hashtags?.length
      ? `${copy.content}\n\n${copy.hashtags.map((h) => `#${h.replace(/^#+/, "")}`).join(" ")}`
      : copy.content;

    const designBriefMd = [
      `**Concept:** ${design.concept}`,
      `**Layout:** ${design.layout}`,
      design.palette?.length ? `**Palette:** ${design.palette.join(", ")}` : "",
      `**Typography:** ${design.typography}`,
      design.on_image_copy ? `**On-image copy:** ${design.on_image_copy}` : "",
      design.reference_notes ? `**Reference notes:** ${design.reference_notes}` : "",
    ].filter(Boolean).join("\n\n");

    const { error: upErr } = await supabase
      .from("posts")
      .update({
        title: copy.title.slice(0, 160),
        copy: finalCopy,
        design_brief: designBriefMd,
        ai_phase: "copy_ready",
      } as never)
      .eq("id", postId);
    if (upErr) throw upErr;

    await patch({
      status: "succeeded",
      progress: 100,
      step_label: null,
      finished_at: new Date().toISOString(),
      target_route: "/content",
      result: { title: copy.title, content: finalCopy, postId, injected: true } as never,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("posts")
      .update({ ai_phase: "copy_failed" } as never)
      .eq("id", postId);
    await patch({ status: "failed", error: message, finished_at: new Date().toISOString(), step_label: null });
  }
}

export const Route = createFileRoute("/api/jobs/post-phase2")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);
        if (token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });

        const raw = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return new Response(JSON.stringify(parsed.error.format()), { status: 400 });

        const supabase = buildUserClient(token);
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const { data: post, error: postErr } = await supabase
          .from("posts")
          .select("id, brand_id, client_id, title")
          .eq("id", parsed.data.postId)
          .single();
        if (postErr || !post) return new Response("Post not found", { status: 404 });

        const { data: job, error: jobErr } = await supabase
          .from("ai_jobs")
          .insert({
            brand_id: post.brand_id,
            client_id: post.client_id,
            user_id: userId,
            kind: "post_phase2",
            title: `Copy + Design: ${post.title.slice(0, 60)}`,
            subtitle: "Aprovado — gerando copy e briefing visual",
            status: "queued",
            progress: 0,
            input: parsed.data as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["input"],
          })
          .select("id")
          .single();
        if (jobErr || !job) return new Response(jobErr?.message ?? "Failed to enqueue", { status: 500 });

        void runPhase2({ jobId: job.id, token, userId, postId: parsed.data.postId });

        return new Response(JSON.stringify({ jobId: job.id }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});