import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  ShieldAlert,
  ThumbsDown,
  ListChecks,
} from "lucide-react";
import {
  decideMonthlyPlanPublic,
  resolveMonthlyPlanPublic,
  type PublicPlanResolve,
  type PublicTopicClientStatus,
} from "@/lib/monthly-plan-public.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const searchSchema = z.object({ token: z.string().min(8) });

export const Route = createFileRoute("/pauta/$planId")({
  validateSearch: (raw: Record<string, unknown>) => searchSchema.parse(raw),
  component: PublicMonthlyPlanPage,
  head: () => ({
    meta: [
      { title: "Pauta mensal — Aprovação do cliente" },
      {
        name: "description",
        content:
          "Revise os temas planejados para o mês e aprove, rejeite ou solicite ajustes — na pauta inteira ou item por item.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Pauta mensal — Aprovação" },
      { property: "og:description", content: "Revise e decida sobre os temas do mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ItemDecision = { decision: "approved" | "rejected" | "changes"; comment: string };
type Mode = "idle" | "changes" | "reject" | "per_item";

const ERRORS: Record<string, string> = {
  feedback_required: "Descreva o motivo ou o que deseja ajustar.",
  item_comment_required: "Explique o motivo nos itens rejeitados ou com ajuste.",
  items_incomplete: "Decida todos os itens antes de enviar.",
  plan_not_pending: "Esta pauta já foi respondida.",
};

function StatusPill({ status }: { status: PublicTopicClientStatus }) {
  if (status === "pending") return null;
  const map = {
    approved: { label: "Aprovado", cls: "border-emerald-500/40 text-emerald-600" },
    changes: { label: "Ajuste solicitado", cls: "border-amber-500/40 text-amber-600" },
    rejected: { label: "Rejeitado", cls: "border-rose-500/40 text-rose-600" },
  } as const;
  const m = map[status];
  return (
    <Badge variant="outline" className={m.cls}>
      {m.label}
    </Badge>
  );
}

function PublicMonthlyPlanPage() {
  const { token } = Route.useSearch();
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveMonthlyPlanPublic);
  const decideFn = useServerFn(decideMonthlyPlanPublic);
  const [mode, setMode] = useState<Mode>("idle");
  const [feedback, setFeedback] = useState("");
  const [items, setItems] = useState<Record<string, ItemDecision>>({});

  const planQ = useQuery<PublicPlanResolve>({
    queryKey: ["public-monthly-plan", token],
    queryFn: () => resolveFn({ data: { token } }),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (kind: "approve" | "reject" | "changes" | "per_item") =>
      decideFn({
        data: {
          token,
          decision: kind,
          feedback,
          items:
            kind === "per_item"
              ? Object.entries(items).map(([topicId, v]) => ({
                  topicId,
                  decision: v.decision,
                  comment: v.comment,
                }))
              : undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res.status === "client_approved"
          ? "Pauta aprovada. Obrigado!"
          : res.status === "client_rejected"
            ? "Resposta registrada. A equipe será avisada."
            : "Ajustes enviados à equipe.",
      );
      setMode("idle");
      void qc.invalidateQueries({ queryKey: ["public-monthly-plan", token] });
    },
    onError: (e: Error) =>
      toast.error(ERRORS[e.message] ?? "Não foi possível registrar sua resposta."),
  });

  const topics = planQ.data?.topics ?? [];
  const allDecided = useMemo(
    () => topics.length > 0 && topics.every((t) => items[t.id]),
    [topics, items],
  );

  if (planQ.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando pauta…
      </div>
    );
  }

  if (planQ.isError || !planQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Link inválido ou expirado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Solicite um novo link de aprovação à sua agência.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { plan, client } = planQ.data;
  const decided = plan.status !== "pending_client";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{client.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{plan.title}</h1>
        {plan.description ? (
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        ) : null}
        {plan.objectives ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Objetivos: </span>
            {plan.objectives}
          </p>
        ) : null}
      </header>

      {decided ? (
        <Card>
          <CardContent className="flex items-start gap-2 py-4 text-sm">
            {plan.status === "client_approved" ? (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <span>Pauta aprovada. A equipe já iniciou a produção.</span>
              </>
            ) : plan.status === "client_rejected" ? (
              <>
                <ThumbsDown className="mt-0.5 h-4 w-4 text-rose-500" />
                <div>
                  <p>Pauta rejeitada.</p>
                  {plan.client_feedback ? (
                    <p className="mt-1 text-muted-foreground">{plan.client_feedback}</p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <MessageSquare className="mt-0.5 h-4 w-4 text-amber-500" />
                <div>
                  <p>Ajustes solicitados. Os itens aprovados seguiram para produção.</p>
                  {plan.client_feedback ? (
                    <p className="mt-1 text-muted-foreground">{plan.client_feedback}</p>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {topics.length} {topics.length === 1 ? "tema" : "temas"} propostos
        </h2>
        <ul className="space-y-3">
          {topics.map((t, i) => {
            const local = items[t.id];
            return (
              <li key={t.id}>
                <Card>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {t.channel ? <Badge variant="secondary">{t.channel}</Badge> : null}
                      {t.content_format ? (
                        <Badge variant="outline">{t.content_format}</Badge>
                      ) : null}
                      <span className="ml-auto">
                        <StatusPill status={t.client_status} />
                      </span>
                    </div>
                    <p className="font-medium">{t.topic_title}</p>
                    {t.angle ? <p className="text-sm text-muted-foreground">{t.angle}</p> : null}
                    {t.target_audience ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Público: </span>
                        {t.target_audience}
                      </p>
                    ) : null}
                    {t.rationale ? (
                      <p className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Por quê: </span>
                        {t.rationale}
                      </p>
                    ) : null}
                    {t.client_comment ? (
                      <p className="text-xs text-muted-foreground">
                        Seu comentário: “{t.client_comment}”
                      </p>
                    ) : null}

                    {mode === "per_item" && !decided ? (
                      <div className="space-y-2 border-t pt-3">
                        <div className="flex flex-wrap gap-2">
                          {(["approved", "changes", "rejected"] as const).map((d) => (
                            <Button
                              key={d}
                              size="sm"
                              variant={local?.decision === d ? "default" : "outline"}
                              onClick={() =>
                                setItems((prev) => ({
                                  ...prev,
                                  [t.id]: { decision: d, comment: prev[t.id]?.comment ?? "" },
                                }))
                              }
                            >
                              {d === "approved"
                                ? "Aprovar"
                                : d === "changes"
                                  ? "Pedir ajuste"
                                  : "Rejeitar"}
                            </Button>
                          ))}
                        </div>
                        {local && local.decision !== "approved" ? (
                          <Textarea
                            value={local.comment}
                            onChange={(e) =>
                              setItems((prev) => ({
                                ...prev,
                                [t.id]: { decision: local.decision, comment: e.target.value },
                              }))
                            }
                            maxLength={1000}
                            rows={3}
                            placeholder="O que deve mudar neste item?"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {!decided ? (
        <section className="space-y-3 border-t pt-4">
          {mode === "idle" ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide.mutate("approve")} disabled={decide.isPending}>
                {decide.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Aprovar pauta inteira
              </Button>
              <Button variant="outline" onClick={() => setMode("changes")}>
                <MessageSquare className="mr-2 h-4 w-4" /> Solicitar ajustes
              </Button>
              <Button variant="outline" onClick={() => setMode("per_item")}>
                <ListChecks className="mr-2 h-4 w-4" /> Decidir item por item
              </Button>
              <Button variant="ghost" onClick={() => setMode("reject")}>
                <ThumbsDown className="mr-2 h-4 w-4" /> Rejeitar pauta
              </Button>
            </div>
          ) : mode === "per_item" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Decida cada item acima. Itens rejeitados ou com ajuste precisam de um comentário.
              </p>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Observação geral (opcional)"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode("idle")} disabled={decide.isPending}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => decide.mutate("per_item")}
                  disabled={decide.isPending || !allDecided}
                >
                  {decide.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Enviar decisões
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder={
                  mode === "reject"
                    ? "Por que esta pauta não atende?"
                    : "O que você gostaria de ajustar nesta pauta?"
                }
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode("idle")} disabled={decide.isPending}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => decide.mutate(mode === "reject" ? "reject" : "changes")}
                  disabled={decide.isPending}
                >
                  {decide.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {mode === "reject" ? "Confirmar rejeição" : "Enviar ajustes"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
