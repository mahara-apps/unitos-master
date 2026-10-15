import { z } from "zod";

export const PRODUCTION_COLORS = ["muted", "indigo", "violet", "amber", "emerald", "sky", "rose", "cyan"] as const;
export const productionStageSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
  label: z.string().trim().min(1).max(40),
  color: z.enum(PRODUCTION_COLORS),
  is_terminal: z.boolean(),
  hide_in_portal: z.boolean(),
  enables_approval_link: z.boolean(),
  sla_hours: z.number().int().min(0).max(8760).nullable(),
}).strict();
export const productionStagesSchema = z.array(productionStageSchema).min(1).max(40).refine(
  (stages) => new Set(stages.map((stage) => stage.key)).size === stages.length,
  "As etapas precisam de identificadores distintos.",
);
export type ProductionStage = z.infer<typeof productionStageSchema>;
export function defaultProductionStages(): ProductionStage[] {
  return [
    ["briefing", "Ideia", "muted"], ["writing", "Produção", "indigo"],
    ["design", "Design", "violet"], ["review", "Revisão", "amber"],
    ["approved", "Aprovado", "emerald"], ["scheduled", "Agendado", "sky"],
  ].map(([key, label, color]) => productionStageSchema.parse({ key, label, color,
    is_terminal: key === "scheduled", hide_in_portal: false, enables_approval_link: false, sla_hours: null }));
}
export const productionPreviewSchema = z.object({
  fingerprint: z.string().min(1), blocked: z.boolean(),
  clients: z.array(z.object({
    clientId: z.string().uuid(), name: z.string().nullable().transform((v) => v?.trim() || "Cliente sem nome"), pipelineId: z.string().uuid().nullable(),
    skipped: z.boolean(), exception: z.boolean(),
    changes: z.array(z.object({
      kind: z.enum(["add", "update", "remove"]), label: z.string(),
      key: z.string().optional(), previous: z.string().optional(), stageId: z.string().uuid().optional(),
      posts: z.number().int().optional(), destination: z.string().nullable().optional(),
    })),
  })),
});
export type ProductionPreview = z.infer<typeof productionPreviewSchema>;
export function needsProductionDestination(preview: ProductionPreview, stages: ProductionStage[], mapping: Record<string, string>) {
  return preview.clients.some((client) => !client.skipped && client.changes.some((change) =>
    change.kind === "remove" && (change.posts ?? 0) > 0 &&
    !stages.some((stage) => stage.key === mapping[change.stageId ?? ""]),
  ));
}