// ⚠️ Brain Query Engine — busca semântica, retrieval e contadores operacionais.
// Encapsula pgvector (`match_brain_events` RPC), embeddings e stats.
import type { BrainContext, SemanticMemoryHit, BrainStats } from "../core";

/** Cria embedding via Lovable AI Gateway. Retorna null em falha. */
export async function embed(text: string): Promise<number[] | null> {
  const { embedText } = await import("../../brain-embed.server");
  return embedText(text);
}

/** Busca semântica por proximidade de vetor no escopo da brand. */
export async function semantic(
  ctx: BrainContext,
  args: { query: string; matchCount?: number },
): Promise<SemanticMemoryHit[]> {
  if (!ctx.brandId || !args.query) return [];
  const vec = await embed(args.query);
  if (!vec) return [];
  const { data } = await ctx.supabase.rpc("match_brain_events", {
    _brand_id: ctx.brandId,
    _query: vec as unknown as string,
    _match_count: args.matchCount ?? 6,
  });
  return ((data ?? []) as Array<SemanticMemoryHit>).map((r) => ({
    content_summary: r.content_summary,
    similarity: r.similarity,
    event_type: r.event_type,
  }));
}

/** Contadores operacionais leves — nunca faz dump de linhas. */
export async function stats(ctx: BrainContext): Promise<BrainStats> {
  const out: BrainStats = {};
  const postsQ = ctx.supabase.from("posts").select("*", { count: "exact", head: true });
  const tasksQ = ctx.supabase.from("tasks").select("*", { count: "exact", head: true });
  const projectsQ = ctx.supabase.from("projects").select("*", { count: "exact", head: true });
  const [posts, tasks, projects] = await Promise.all([
    ctx.brandId ? postsQ.eq("brand_id", ctx.brandId) : postsQ,
    ctx.brandId ? tasksQ.eq("brand_id", ctx.brandId) : tasksQ,
    ctx.brandId ? projectsQ.eq("brand_id", ctx.brandId) : projectsQ,
  ]);
  if (typeof posts.count === "number") out.posts = posts.count;
  if (typeof tasks.count === "number") out.tasks = tasks.count;
  if (typeof projects.count === "number") out.projects = projects.count;
  return out;
}