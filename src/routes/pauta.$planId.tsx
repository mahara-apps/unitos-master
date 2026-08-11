import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MessageSquare, ShieldAlert } from "lucide-react";
import {
  decideMonthlyPlanPublic,
  resolveMonthlyPlanPublic,
  type PublicPlanResolve,
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
        content: "Revise os temas planejados para o mês e aprove ou solicite ajustes.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Pauta mensal — Aprovação" },
      { property: "og:description", content: "Revise e aprove os temas do mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PublicMonthlyPlanPage() {
  const { token } = Route.useSearch();
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveMonthlyPlanPublic);
  const decideFn = useServerFn(decideMonthlyPlanPublic);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const planQ = useQuery<PublicPlanResolve>({
    queryKey: ["public-monthly-plan", token],
    queryFn: () => resolveFn({ data: { token } }),
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (decision: "approve" | "changes") =>
      decideFn({ data: { token, decision, feedback } }),
    onSuccess: (_r, decision) => {
      toast.success(
        decision === "approve" ? "Pauta aprovada. Obrigado!" : "Ajustes enviados à equipe.",
      );
      setShowFeedback(false);
      void qc.invalidateQueries({ queryKey: ["public-monthly-plan", token] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "feedback_required"
          ? "Descreva o que deseja ajustar."
          : "Não foi possível registrar sua resposta.",
      ),
  });

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

  const { plan, client, topics } = planQ.data;
  const decided = plan.status === "client_approved" || plan.status === "changes_requested";

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
                <span>Pauta aprovada. A equipe já pode iniciar a produção.</span>
              </>
            ) : (
              <>
                <MessageSquare className="mt-0.5 h-4 w-4 text-amber-500" />
                <div>
                  <p>Ajustes solicitados.</p>
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
          {topics.map((t, i) => (
            <li key={t.id}>
              <Card>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {t.channel ? <Badge variant="secondary">{t.channel}</Badge> : null}
                    {t.content_format ? <Badge variant="outline">{t.content_format}</Badge> : null}
                  </div>
                  <p className="font-medium">{t.topic_title}</p>
                  {t.angle ? (
                    <p className="text-sm text-muted-foreground">{t.angle}</p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {!decided ? (
        <section className="space-y-3 border-t pt-4">
          {showFeedback ? (
            <div className="space-y-2">
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="O que você gostaria de ajustar nesta pauta?"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowFeedback(false)}
                  disabled={decide.isPending}
                >
                  Cancelar
                </Button>
                <Button onClick={() => decide.mutate("changes")} disabled={decide.isPending}>
                  Enviar ajustes
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide.mutate("approve")} disabled={decide.isPending}>
                {decide.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Aprovar pauta
              </Button>
              <Button variant="outline" onClick={() => setShowFeedback(true)}>
                <MessageSquare className="mr-2 h-4 w-4" /> Solicitar ajustes
              </Button>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
