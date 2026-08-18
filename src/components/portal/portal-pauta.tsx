import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Hourglass,
  Loader2,
  MessageSquare,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { usePortalApi } from "./portal-context";
import { EmptyState, ListSkeleton, formatDate } from "./portal-shared";
import type { PlanDecisionItem, PublicPlanTopic } from "@/lib/monthly-plan-client.types";
import { PLAN_PENDING_CLIENT_STATUS } from "@/lib/monthly-plan-client.types";

/**
 * Aprovação de pauta dentro do portal — mesmo fluxo real de `monthly_plans`,
 * com decisão item-a-item. Funciona igual nos dois modos porque só consome
 * `usePortalApi()`.
 */
export function PautaApprovals() {
  const api = usePortalApi();
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["portal", "plans", api.scopeKey], queryFn: () => api.plans() });

  if (openId) return <PautaDetail planId={openId} onBack={() => setOpenId(null)} />;
  if (q.isLoading) return <ListSkeleton />;
  if (!q.data?.length)
    return (
      <EmptyState
        icon={Sparkles}
        title="Nenhuma pauta compartilhada"
        description="Quando a equipe enviar a pauta do mês para sua aprovação, ela aparece aqui."
      />
    );

  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
      {q.data.map((p) => {
        const awaiting = p.status === PLAN_PENDING_CLIENT_STATUS;
        return (
          <button
            key={p.id}
            onClick={() => setOpenId(p.id)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
          >
            <div className="min-w-0 space-y-1">
              <div className="truncate text-sm font-medium">{p.title}</div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {formatDate(p.created_at)}
                </span>
                <span>{p.topics} itens</span>
                {p.pending > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {p.pending} sem decisão
                  </span>
                )}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                awaiting
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {awaiting ? "aguardando você" : p.client_decision_at ? "respondida" : p.status}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DECISION_LABEL: Record<PublicPlanTopic["client_status"], string> = {
  pending: "Sem decisão",
  approved: "Aprovado",
  rejected: "Recusado",
  changes: "Ajustar",
};

function PautaDetail({ planId, onBack }: { planId: string; onBack: () => void }) {
  const api = usePortalApi();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["portal", "plan", api.scopeKey, planId],
    queryFn: () => api.plan(planId),
  });
  const [items, setItems] = useState<
    Record<string, { decision: PlanDecisionItem["decision"]; comment: string }>
  >({});
  const [feedback, setFeedback] = useState("");

  const topics = q.data?.topics ?? [];
  const editable = q.data?.plan.status === PLAN_PENDING_CLIENT_STATUS;

  const decided = useMemo(
    () =>
      topics.map((t) => ({
        topic: t,
        decision: items[t.id]?.decision ?? (t.client_status === "pending" ? null : t.client_status),
      })),
    [topics, items],
  );
  const missing = decided.filter((d) => !d.decision).length;

  const decide = useMutation({
    mutationFn: (payload: Parameters<typeof api.decidePlan>[0]) => api.decidePlan(payload),
    onSuccess: (res) => {
      toast.success(
        res.cardsCreated > 0
          ? `Pauta respondida — ${res.approved} aprovados e ${res.cardsCreated} peças liberadas para produção.`
          : `Pauta respondida — ${res.approved} aprovados, ${res.changes} para ajuste, ${res.rejected} recusados.`,
      );
      setItems({});
      qc.invalidateQueries({ queryKey: ["portal", "plan", api.scopeKey, planId] });
      qc.invalidateQueries({ queryKey: ["portal", "plans", api.scopeKey] });
      qc.invalidateQueries({ queryKey: ["portal", "metrics", api.scopeKey] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível registrar sua decisão."),
  });

  const setDecision = (topicId: string, decision: PlanDecisionItem["decision"]) =>
    setItems((prev) => ({
      ...prev,
      [topicId]: { decision, comment: prev[topicId]?.comment ?? "" },
    }));

  const submitPerItem = () => {
    const payload: PlanDecisionItem[] = decided
      .filter((d) => d.decision)
      .map((d) => ({
        topicId: d.topic.id,
        decision: d.decision as PlanDecisionItem["decision"],
        comment: items[d.topic.id]?.comment ?? d.topic.client_comment ?? "",
      }));
    decide.mutate({ planId, decision: "per_item", feedback, items: payload });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      {q.isLoading ? (
        <ListSkeleton />
      ) : !q.data ? (
        <EmptyState
          icon={Sparkles}
          title="Pauta indisponível"
          description="Peça um novo link à equipe."
        />
      ) : (
        <>
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              pauta do mês · {q.data.client.name}
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{q.data.plan.title}</h2>
            {q.data.plan.objectives && (
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {q.data.plan.objectives}
              </p>
            )}
            {!editable && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {q.data.plan.client_decision_at
                  ? `Respondida em ${formatDate(q.data.plan.client_decision_at)}`
                  : "Ainda não liberada para aprovação"}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {decided.map(({ topic, decision }) => (
              <div key={topic.id} className="rounded-xl border border-border/60 bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {topic.channel && (
                    <span className="rounded bg-muted px-1.5 py-0.5">{topic.channel}</span>
                  )}
                  {topic.content_format && (
                    <span className="rounded bg-muted px-1.5 py-0.5">{topic.content_format}</span>
                  )}
                  <span
                    className={decision ? "text-foreground" : "text-amber-600 dark:text-amber-400"}
                  >
                    {decision ? DECISION_LABEL[decision] : "sem decisão"}
                  </span>
                </div>
                <div className="mt-1.5 text-sm font-medium">{topic.topic_title}</div>
                {topic.angle && (
                  <div className="mt-1 text-xs text-muted-foreground">{topic.angle}</div>
                )}
                {topic.rationale && (
                  <div className="mt-1 text-xs text-muted-foreground">{topic.rationale}</div>
                )}

                {editable && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { v: "approved", label: "Aprovar", icon: Check },
                          { v: "changes", label: "Ajustar", icon: RotateCcw },
                          { v: "rejected", label: "Recusar", icon: X },
                        ] as const
                      ).map((opt) => {
                        const Icon = opt.icon;
                        const active = decision === opt.v;
                        return (
                          <Button
                            key={opt.v}
                            size="sm"
                            variant={active ? "default" : "outline"}
                            className="h-7 gap-1 text-xs"
                            onClick={() => setDecision(topic.id, opt.v)}
                          >
                            <Icon className="h-3 w-3" /> {opt.label}
                          </Button>
                        );
                      })}
                    </div>
                    {decision && decision !== "approved" && (
                      <Textarea
                        value={items[topic.id]?.comment ?? topic.client_comment ?? ""}
                        onChange={(e) =>
                          setItems((prev) => ({
                            ...prev,
                            [topic.id]: { decision, comment: e.target.value },
                          }))
                        }
                        placeholder="O que precisa mudar neste item?"
                        className="min-h-16 text-sm"
                      />
                    )}
                  </div>
                )}
                {!editable && topic.client_comment && (
                  <div className="mt-2 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" /> {topic.client_comment}
                  </div>
                )}
              </div>
            ))}
          </div>

          {editable && (
            <div className="sticky bottom-0 space-y-3 rounded-xl border border-border/60 bg-card/95 p-4 backdrop-blur">
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Comentário geral para a equipe (opcional)"
                className="min-h-16 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="gap-1.5"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ planId, decision: "approve", feedback })}
                >
                  {decide.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Aprovar tudo
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={decide.isPending || missing === topics.length}
                  onClick={submitPerItem}
                >
                  <Hourglass className="h-4 w-4" /> Enviar decisões item a item
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ planId, decision: "changes", feedback })}
                >
                  <RotateCcw className="h-4 w-4" /> Pedir revisão geral
                </Button>
                {missing > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {missing} item(ns) ainda sem decisão
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
