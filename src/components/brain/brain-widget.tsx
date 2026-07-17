// Brain Widget — componente reutilizável de inteligência distribuída.
//
// Aparece em qualquer módulo (Projetos, Clientes, Conteúdo, Mídia, CRM,
// Financeiro, Analytics). Consulta APENAS a Brain API via server function
// `loadBrainWidget`; nunca toca `brain_*` diretamente.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Lightbulb, Sparkles, TrendingUp, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useActiveContext } from "@/hooks/use-active-context";
import { loadBrainWidget, type BrainWidgetItem, type BrainWidgetPayload } from "@/lib/brain/api";

export type BrainWidgetPreset =
  | "projects"
  | "customers"
  | "content"
  | "media"
  | "crm"
  | "finance"
  | "analytics"
  | "custom";

type PresetSpec = { module: string; topic: string; title: string; hint: string };

const PRESETS: Record<Exclude<BrainWidgetPreset, "custom">, PresetSpec> = {
  projects: {
    module: "projects",
    topic: "risco de atraso e gargalos nos projetos ativos",
    title: "Brain · Risco de atraso",
    hint: "Sinais operacionais e memórias sobre a saúde dos projetos.",
  },
  customers: {
    module: "customers",
    topic: "comportamento do cliente, engajamento e histórico recente",
    title: "Brain · Comportamento do cliente",
    hint: "Padrões observados no relacionamento com este cliente.",
  },
  content: {
    module: "content",
    topic: "melhor horário e formato para publicar conteúdo",
    title: "Brain · Melhor horário",
    hint: "Recomendações de agendamento baseadas em histórico.",
  },
  media: {
    module: "media",
    topic: "campanhas semelhantes de mídia paga com bom desempenho",
    title: "Brain · Campanhas semelhantes",
    hint: "Referências históricas com desempenho comparável.",
  },
  crm: {
    module: "crm",
    topic: "oportunidade de venda, upsell e sinais de intenção",
    title: "Brain · Oportunidade de venda",
    hint: "Sinais de intenção detectados no funil.",
  },
  finance: {
    module: "finance",
    topic: "risco de inadimplência e comportamento de pagamento",
    title: "Brain · Risco financeiro",
    hint: "Padrões de pagamento e alertas de inadimplência.",
  },
  analytics: {
    module: "analytics",
    topic: "explicação das métricas e variações relevantes no período",
    title: "Brain · Leitura das métricas",
    hint: "O que o Brain observou nas métricas recentes.",
  },
};

export interface BrainWidgetProps {
  preset?: BrainWidgetPreset;
  /** Sobrescreve o topic (obrigatório quando preset="custom"). */
  topic?: string;
  /** Sobrescreve o module (obrigatório quando preset="custom"). */
  module?: string;
  /** Título opcional (sobrescreve o do preset). */
  title?: string;
  clientId?: string | null;
  projectId?: string | null;
  maxItems?: number;
  className?: string;
  compact?: boolean;
}

export function BrainWidget({
  preset = "custom",
  topic,
  module,
  title,
  clientId,
  projectId,
  maxItems = 4,
  className,
  compact = false,
}: BrainWidgetProps) {
  const { brandId, clientId: activeClientId } = useActiveContext();
  const load = useServerFn(loadBrainWidget);

  const spec = useMemo<PresetSpec>(() => {
    if (preset !== "custom") return PRESETS[preset];
    return {
      module: module ?? "custom",
      topic: topic ?? "contexto atual",
      title: title ?? "Brain",
      hint: "Contexto consolidado pelo Brain.",
    };
  }, [preset, module, topic, title]);

  const resolvedClientId = clientId ?? activeClientId ?? null;

  const query = useQuery<BrainWidgetPayload>({
    queryKey: [
      "brain-widget",
      spec.module,
      spec.topic,
      brandId,
      resolvedClientId,
      projectId ?? null,
      maxItems,
    ],
    queryFn: () =>
      load({
        data: {
          topic: spec.topic,
          module: spec.module,
          brandId,
          clientId: resolvedClientId,
          projectId: projectId ?? null,
          maxItems,
        },
      }),
    enabled: Boolean(brandId),
    staleTime: 60_000,
  });

  const displayTitle = title ?? spec.title;

  return (
    <Card className={cn("border-primary/10 bg-primary/[0.02]", className)}>
      <CardHeader className={cn("pb-2", compact && "pb-1 pt-3")}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4 text-primary" />
            <span>{displayTitle}</span>
          </CardTitle>
          {query.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : query.data ? (
            <Badge variant="secondary" className="h-5 text-[10px] font-normal">
              {query.data.candidateCount} sinais
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-1", compact && "pb-3")}>
        {!brandId ? (
          <EmptyState text="Selecione um workspace para ativar o Brain." />
        ) : query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ) : query.error ? (
          <EmptyState text="Não foi possível consultar o Brain agora." />
        ) : !query.data?.hasData ? (
          <EmptyState text={query.data?.headline ?? spec.hint} />
        ) : (
          <div className="space-y-2.5">
            <p className="text-sm leading-snug text-foreground">{query.data.headline}</p>
            <ul className="space-y-1.5">
              {query.data.items.map((item, idx) => (
                <li key={`${item.kind}-${idx}`} className="flex items-start gap-2">
                  <KindIcon kind={item.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{item.label}</p>
                    {item.detail && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {Math.round(item.score * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KindIcon({ kind }: { kind: BrainWidgetItem["kind"] }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0";
  switch (kind) {
    case "insight":
      return <Lightbulb className={cn(cls, "text-amber-500")} />;
    case "recommendation":
      return <Sparkles className={cn(cls, "text-primary")} />;
    case "stat":
      return <TrendingUp className={cn(cls, "text-emerald-500")} />;
    default:
      return <Brain className={cn(cls, "text-muted-foreground")} />;
  }
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}
