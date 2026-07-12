import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STAGE_COLORS = [
  "muted",
  "indigo",
  "violet",
  "amber",
  "emerald",
  "sky",
  "rose",
  "cyan",
] as const;
export type StageColor = (typeof STAGE_COLORS)[number];

const DEFAULT_STAGES: Array<{ key: string; label: string; color: StageColor; is_terminal?: boolean }> = [
  { key: "briefing", label: "Ideia", color: "muted" },
  { key: "writing", label: "Produção", color: "indigo" },
  { key: "design", label: "Design", color: "violet" },
  { key: "review", label: "Revisão", color: "amber" },
  { key: "approved", label: "Aprovado", color: "emerald" },
  { key: "scheduled", label: "Agendado", color: "sky", is_terminal: true },
];

// ---------- Types ----------
export type Pipeline = {
  id: string;
  brand_id: string;
  client_id: string;
  name: string;
  slug: string;
  is_default: boolean;
  position: number;
  post_count: number;
};

export type PipelineStage = {
  id: string;
  pipeline_id: string;
  key: string;
  label: string;
  color: StageColor;
  position: number;
  is_terminal: boolean;
};

export type BoardPost = {
  id: string;
  title: string;
  copy: string | null;
  channels: string[];
  scheduled_at: string | null;
  published_at: string | null;
  assignee_id: string | null;
  cover_url: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  brand_id: string;
  client_id: string;
  review_status?: string | null;
  reference_media?: Array<{ path: string; name?: string; type?: string; size?: number }> | null;
  design_brief?: string | null;
  ai_phase?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
};

export type Board = {
  pipeline: Pipeline;
  stages: PipelineStage[];
  posts: BoardPost[];
};

// ---------- Pipelines ----------
const clientScope = z.object({ brandId: z.string().uuid(), clientId: z.string().uuid() });

export const listPipelinesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clientScope.parse(i))
  .handler(async ({ data, context }): Promise<Pipeline[]> => {
    const { data: pipes, error } = await context.supabase
      .from("content_pipelines")
      .select("id,brand_id,client_id,name,slug,is_default,position")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;

    if (!pipes || pipes.length === 0) return [];

    const { data: counts } = await context.supabase
      .from("posts")
      .select("pipeline_id")
      .in("pipeline_id", pipes.map((p) => p.id));
    const countMap = new Map<string, number>();
    (counts ?? []).forEach((r: { pipeline_id: string | null }) => {
      if (!r.pipeline_id) return;
      countMap.set(r.pipeline_id, (countMap.get(r.pipeline_id) ?? 0) + 1);
    });
    return pipes.map((p) => ({ ...p, post_count: countMap.get(p.id) ?? 0 }));
  });

export const ensureDefaultPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => clientScope.parse(i))
  .handler(async ({ data, context }): Promise<Pipeline> => {
    const { data: existing } = await context.supabase
      .from("content_pipelines")
      .select("id,brand_id,client_id,name,slug,is_default,position")
      .eq("brand_id", data.brandId)
      .eq("client_id", data.clientId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (existing && existing.length > 0) return { ...existing[0], post_count: 0 };

    const { data: pipe, error } = await context.supabase
      .from("content_pipelines")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        name: "Pipeline principal",
        slug: "main",
        is_default: true,
        position: 0,
        created_by: context.userId,
      })
      .select("id,brand_id,client_id,name,slug,is_default,position")
      .single();
    if (error) throw error;

    await context.supabase.from("content_pipeline_stages").insert(
      DEFAULT_STAGES.map((s, i) => ({
        pipeline_id: pipe.id,
        key: s.key,
        label: s.label,
        color: s.color,
        position: i * 1024,
        is_terminal: s.is_terminal ?? false,
      })),
    );

    return { ...pipe, post_count: 0 };
  });

export const createPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        name: z.string().min(1).max(80),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<Pipeline> => {
    const slug =
      data.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || `pipeline-${Date.now()}`;

    const { data: maxRow } = await context.supabase
      .from("content_pipelines")
      .select("position")
      .eq("client_id", data.clientId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((maxRow?.[0]?.position ?? -1) as number) + 1;

    const { data: pipe, error } = await context.supabase
      .from("content_pipelines")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        name: data.name.trim(),
        slug,
        is_default: false,
        position: nextPos,
        created_by: context.userId,
      })
      .select("id,brand_id,client_id,name,slug,is_default,position")
      .single();
    if (error) throw error;

    await context.supabase.from("content_pipeline_stages").insert(
      DEFAULT_STAGES.map((s, i) => ({
        pipeline_id: pipe.id,
        key: s.key,
        label: s.label,
        color: s.color,
        position: i * 1024,
        is_terminal: s.is_terminal ?? false,
      })),
    );
    return { ...pipe, post_count: 0 };
  });

export const renamePipelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ pipelineId: z.string().uuid(), name: z.string().min(1).max(80) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_pipelines")
      .update({ name: data.name.trim() })
      .eq("id", data.pipelineId);
    if (error) throw error;
    return { ok: true };
  });

export const deletePipelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_pipelines")
      .delete()
      .eq("id", data.pipelineId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Board ----------

export const loadBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        pipelineId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<Board> => {
    const [{ data: pipe, error: pErr }, { data: stages, error: sErr }, { data: posts, error: poErr }] =
      await Promise.all([
        context.supabase
          .from("content_pipelines")
          .select("id,brand_id,client_id,name,slug,is_default,position")
          .eq("id", data.pipelineId)
          .single(),
        context.supabase
          .from("content_pipeline_stages")
          .select("id,pipeline_id,key,label,color,position,is_terminal")
          .eq("pipeline_id", data.pipelineId)
          .order("position", { ascending: true }),
        context.supabase
          .from("posts")
          .select(
            "id,title,copy,channels,scheduled_at,published_at,assignee_id,cover_url,stage_id,pipeline_id,position,created_at,updated_at,brand_id,client_id",
          )
          .eq("brand_id", data.brandId)
          .eq("client_id", data.clientId)
          .eq("pipeline_id", data.pipelineId)
          .order("position", { ascending: true }),
      ]);
    if (pErr) throw pErr;
    if (sErr) throw sErr;
    if (poErr) throw poErr;

    // Auto-assign posts com stage_id nulo (herança do backfill divergente)
    const orphaned = (posts ?? []).filter((p) => !p.stage_id);
    if (orphaned.length > 0 && stages && stages.length > 0) {
      const firstStage = stages[0].id;
      await context.supabase
        .from("posts")
        .update({ stage_id: firstStage })
        .in(
          "id",
          orphaned.map((p) => p.id),
        );
      orphaned.forEach((p) => (p.stage_id = firstStage));
    }

    return {
      pipeline: { ...pipe, post_count: (posts ?? []).length },
      stages: (stages ?? []) as PipelineStage[],
      posts: (posts ?? []) as BoardPost[],
    };
  });

// ---------- Post move (optimistic) ----------

export const movePostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        toStageId: z.string().uuid(),
        toPosition: z.number().int(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("posts")
      .update({ stage_id: data.toStageId, position: data.toPosition })
      .eq("id", data.postId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Stages CRUD ----------

export const createStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid(),
        label: z.string().min(1).max(40),
        color: z.enum(STAGE_COLORS).default("muted"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const key = `stage-${Date.now().toString(36)}`;
    const { data: maxRow } = await context.supabase
      .from("content_pipeline_stages")
      .select("position")
      .eq("pipeline_id", data.pipelineId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((maxRow?.[0]?.position ?? -1) as number) + 1024;

    const { data: st, error } = await context.supabase
      .from("content_pipeline_stages")
      .insert({
        pipeline_id: data.pipelineId,
        key,
        label: data.label.trim(),
        color: data.color,
        position: nextPos,
      })
      .select("id,pipeline_id,key,label,color,position,is_terminal")
      .single();
    if (error) throw error;
    return st as PipelineStage;
  });

export const updateStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        stageId: z.string().uuid(),
        patch: z
          .object({
            label: z.string().min(1).max(40).optional(),
            color: z.enum(STAGE_COLORS).optional(),
            is_terminal: z.boolean().optional(),
          })
          .strict(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_pipeline_stages")
      .update(data.patch)
      .eq("id", data.stageId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ stageId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // Move posts to first remaining stage of same pipeline
    const { data: stage } = await context.supabase
      .from("content_pipeline_stages")
      .select("id,pipeline_id")
      .eq("id", data.stageId)
      .maybeSingle();
    if (!stage) return { ok: true };
    const { data: siblings } = await context.supabase
      .from("content_pipeline_stages")
      .select("id")
      .eq("pipeline_id", stage.pipeline_id)
      .neq("id", data.stageId)
      .order("position", { ascending: true })
      .limit(1);
    if (!siblings || siblings.length === 0) {
      throw new Error("Não é possível excluir a única coluna do pipeline.");
    }
    await context.supabase.from("posts").update({ stage_id: siblings[0].id }).eq("stage_id", data.stageId);
    const { error } = await context.supabase
      .from("content_pipeline_stages")
      .delete()
      .eq("id", data.stageId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Post CRUD + detail ----------

export const createPostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        brandId: z.string().uuid(),
        clientId: z.string().uuid(),
        pipelineId: z.string().uuid(),
        stageId: z.string().uuid(),
        title: z.string().min(1).max(160),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<BoardPost> => {
    const { data: maxRow } = await context.supabase
      .from("posts")
      .select("position")
      .eq("stage_id", data.stageId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((maxRow?.[0]?.position ?? -1) as number) + 1024;

    const { data: post, error } = await context.supabase
      .from("posts")
      .insert({
        brand_id: data.brandId,
        client_id: data.clientId,
        pipeline_id: data.pipelineId,
        stage_id: data.stageId,
        title: data.title.trim(),
        stage: "idea",
        position: nextPos,
        created_by: context.userId,
      })
      .select(
        "id,title,copy,channels,scheduled_at,published_at,assignee_id,cover_url,stage_id,pipeline_id,position,created_at,updated_at,brand_id,client_id",
      )
      .single();
    if (error) throw error;
    return post as BoardPost;
  });

export const updatePostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        patch: z
          .object({
            title: z.string().min(1).max(160).optional(),
            copy: z.string().max(6000).nullable().optional(),
            scheduled_at: z.string().nullable().optional(),
            assignee_id: z.string().uuid().nullable().optional(),
            channels: z
              .array(z.enum(["instagram", "tiktok", "linkedin", "x", "youtube", "blog"]))
              .optional(),
            reference_media: z
              .array(
                z.object({
                  path: z.string(),
                  name: z.string().optional(),
                  type: z.string().optional(),
                  size: z.number().optional(),
                }),
              )
              .optional(),
            design_brief: z.string().max(8000).nullable().optional(),
            review_status: z.enum(["pending", "approved", "rejected"]).optional(),
          })
          .strict(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { ...data.patch };
    if (patch.review_status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = context.userId;
    }
    const { error } = await context.supabase
      .from("posts")
      .update(patch as never)
      .eq("id", data.postId);
    if (error) throw error;
    return { ok: true };
  });

export const deletePostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("posts").delete().eq("id", data.postId);
    if (error) throw error;
    return { ok: true };
  });

export type PostTimelineEvent = {
  id: string;
  verb: string;
  payload: string | null;
  created_at: string;
  actor_id: string | null;
};

export const getPostDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ post: BoardPost; timeline: PostTimelineEvent[] }> => {
    const [{ data: post, error }, { data: events }] = await Promise.all([
      context.supabase
        .from("posts")
        .select(
          "id,title,copy,channels,scheduled_at,published_at,assignee_id,cover_url,stage_id,pipeline_id,position,created_at,updated_at,brand_id,client_id",
        )
        .eq("id", data.postId)
        .single(),
      context.supabase
        .from("activity_events")
        .select("id,verb,payload,created_at,actor_id")
        .eq("entity_type", "post")
        .eq("entity_id", data.postId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (error) throw error;
    return {
      post: post as BoardPost,
      timeline: (events ?? []).map((e) => ({
        id: e.id,
        verb: e.verb,
        payload: e.payload == null ? null : JSON.stringify(e.payload),
        created_at: e.created_at,
        actor_id: e.actor_id,
      })) as PostTimelineEvent[],
    };
  });