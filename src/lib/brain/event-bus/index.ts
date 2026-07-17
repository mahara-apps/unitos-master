// ⚠️ Brain Event Bus — publica eventos no barramento interno do Brain.
// Este é o ÚNICO caminho autorizado para inserir em `brain_events` a partir
// da plataforma. Módulos externos devem consumir via `brain.events.publish()`.
import type { BrainContext, BrainEventInput } from "../core";

export async function publish(ctx: BrainContext, event: BrainEventInput): Promise<void> {
  const { error } = await ctx.supabase.from("brain_events").insert({
    brand_id: event.brand_id,
    client_id: event.client_id ?? null,
    source_module: event.source_module,
    event_type: event.event_type,
    actor_id: event.actor_id ?? ctx.userId,
    payload: event.payload,
  });
  if (error) {
    // Event Bus é best-effort — nunca deve derrubar o fluxo do chamador.
    console.error("[brain.events.publish]", error.message);
  }
}

export async function list(
  ctx: BrainContext,
  opts: { limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const q = ctx.supabase
    .from("brain_events")
    .select("id, brand_id, client_id, source_module, event_type, actor_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  const { data } = ctx.brandId ? await q.eq("brand_id", ctx.brandId) : await q;
  return (data ?? []) as Array<Record<string, unknown>>;
}