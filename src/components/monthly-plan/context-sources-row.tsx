import { BrainCircuit, BarChart3, FileText, AlertTriangle } from "lucide-react";
import { PLAN_CHANNEL_LABEL, type PlanChannel } from "@/lib/monthly-plan-fields";
import type { MonthlyPlan } from "@/lib/monthly-plans.functions";

/**
 * Selos de rastreabilidade: mostram quais fontes a IA cruzou para gerar a pauta
 * (estratégia IA ativa, métricas reais por canal, contexto do Brain/briefing).
 */
export function ContextSourcesRow({
  sources,
}: {
  sources: MonthlyPlan["context_sources"];
}) {
  if (!sources) return null;

  const strategyBlocks = sources.strategy_blocks ?? [];
  const metricsChannels = (sources.metrics_channels ?? []) as PlanChannel[];
  const missing = (sources.channels_without_account ?? []) as PlanChannel[];
  const label = (c: PlanChannel) => PLAN_CHANNEL_LABEL[c] ?? c;

  const chips: Array<{ icon: React.ReactNode; text: string; tone: "ok" | "warn" }> = [];

  chips.push(
    strategyBlocks.length
      ? {
          icon: <BrainCircuit className="h-3 w-3" />,
          text: `Estratégia IA: ${strategyBlocks.join(", ")}${
            sources.strategy_generated_at
              ? ` · ${new Date(sources.strategy_generated_at).toLocaleDateString("pt-BR")}`
              : ""
          }`,
          tone: "ok",
        }
      : {
          icon: <AlertTriangle className="h-3 w-3" />,
          text: "Sem estratégia IA ativa",
          tone: "warn",
        },
  );

  chips.push(
    metricsChannels.length
      ? {
          icon: <BarChart3 className="h-3 w-3" />,
          text: `Métricas reais: ${metricsChannels.map(label).join(", ")}`,
          tone: "ok",
        }
      : {
          icon: <AlertTriangle className="h-3 w-3" />,
          text: "Sem métricas de contas conectadas",
          tone: "warn",
        },
  );

  if (missing.length) {
    chips.push({
      icon: <AlertTriangle className="h-3 w-3" />,
      text: `Sem conta conectada: ${missing.map(label).join(", ")}`,
      tone: "warn",
    });
  }

  chips.push({
    icon: <FileText className="h-3 w-3" />,
    text: sources.brain_context ? "Briefing + Brain" : "Briefing",
    tone: "ok",
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
            c.tone === "warn"
              ? "border-amber-500/40 bg-amber-500/5 text-amber-500"
              : "border-border/60 bg-background/60 text-muted-foreground"
          }`}
        >
          {c.icon}
          {c.text}
        </span>
      ))}
      {sources.model ? (
        <span className="text-[11px] text-muted-foreground/70">modelo: {sources.model}</span>
      ) : null}
    </div>
  );
}
