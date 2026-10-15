import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBrandAdmin, assertBrandMember } from "@/lib/access-guard";
import { callRpc } from "@/lib/supabase-rpc";
import { productionStagesSchema, productionPreviewSchema, defaultProductionStages } from "@/lib/production-stages";

const scope = z.object({ brandId: z.string().uuid() });
const request = scope.extend({ stages: productionStagesSchema, keepExceptions: z.boolean(), mapping: z.record(z.string().uuid(), z.string()).default({}) });

export const getProductionStagesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((i: unknown) => scope.parse(i))
  .handler(async ({ data, context }) => {
    await assertBrandMember(context.supabase, context.userId, data.brandId);
    const result = await context.supabase.from("production_stage_defaults").select("stages").eq("brand_id", data.brandId).maybeSingle();
    if (result.error) throw result.error;
    return { configured: !!result.data, stages: result.data ? productionStagesSchema.parse(result.data.stages) : defaultProductionStages() };
  });

export const saveProductionStagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((i: unknown) => scope.extend({ stages: productionStagesSchema }).parse(i))
  .handler(async ({ data, context }) => {
    await assertBrandAdmin(context.supabase, context.userId, data.brandId, { allowManager: false });
    const result = await callRpc(context.supabase, "production_stages_save", { _brand: data.brandId, _stages: data.stages });
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

export const previewProductionStagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((i: unknown) => request.parse(i))
  .handler(async ({ data, context }) => {
    await assertBrandAdmin(context.supabase, context.userId, data.brandId, { allowManager: false });
    const result = await callRpc(context.supabase, "production_stages_preview", { _brand: data.brandId, _stages: data.stages, _keep_exceptions: data.keepExceptions, _mapping: data.mapping });
    if (result.error) throw new Error(result.error.message);
    return productionPreviewSchema.parse(result.data);
  });

export const applyProductionStagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((i: unknown) => request.extend({ fingerprint: z.string().min(1), operationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertBrandAdmin(context.supabase, context.userId, data.brandId, { allowManager: false });
    const result = await callRpc(context.supabase, "production_stages_apply", { _brand: data.brandId, _stages: data.stages, _keep_exceptions: data.keepExceptions, _mapping: data.mapping, _fingerprint: data.fingerprint, _operation: data.operationId });
    if (result.error) {
      if (result.error.message.includes("production_preview_stale")) throw new Error("O quadro mudou desde a prévia. Confira uma nova prévia antes de aplicar.");
      throw new Error(result.error.message);
    }
    return z.object({ clients: z.number().int(), movedPosts: z.number().int() }).parse(result.data);
  });

export const markProductionExceptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((i: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const result = await callRpc(context.supabase, "production_pipeline_exception", { _pipeline: data.pipelineId, _exception: true });
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

export const getProductionPipelineStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator((i: unknown) => z.object({ pipelineId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const pipe = await context.supabase.from("content_pipelines").select("brand_id,follows_brand_default,is_default").eq("id", data.pipelineId).is("deleted_at", null).single();
    if (pipe.error) throw pipe.error;
    await assertBrandMember(context.supabase, context.userId, pipe.data.brand_id);
    const [template, stages] = await Promise.all([
      context.supabase.from("production_stage_defaults").select("stages").eq("brand_id", pipe.data.brand_id).maybeSingle(),
      context.supabase.from("content_pipeline_stages").select("key,label,color,is_terminal,hide_in_portal,enables_approval_link,sla_hours,sla_days").eq("pipeline_id", data.pipelineId).order("position"),
    ]);
    if (template.error) throw template.error;
    if (stages.error) throw stages.error;
    const actual = productionStagesSchema.parse(stages.data.map(({ sla_days, ...stage }) => ({ ...stage, sla_hours: stage.sla_hours ?? (sla_days === null ? null : sla_days * 24) })));
    const standard = template.data ? productionStagesSchema.parse(template.data.stages) : null;
    return { follows: pipe.data.follows_brand_default, primary: pipe.data.is_default, equal: !!standard && JSON.stringify(actual) === JSON.stringify(standard) };
  });