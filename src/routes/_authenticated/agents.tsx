import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Brain,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  listAgentPromptsFn,
  listAgentJobsFn,
  getBrandVolumetryFn,
} from "@/lib/agents.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const { brandId, clientId } = useActiveContext();
  const qc = useQueryClient();
  const listPrompts = useServerFn(listAgentPromptsFn);
  const listJobs = useServerFn(listAgentJobsFn);
  const getVol = useServerFn(getBrandVolumetryFn);

  const prompts = useQuery({
    queryKey: ["agent-prompts"],
    queryFn: () => listPrompts(),
  });

  const jobs = useQuery({
    enabled: !!brandId,
    queryKey: ["agent-jobs", brandId, clientId],
    queryFn: () => listJobs({ data: { brandId: brandId!, clientId: clientId ?? null, limit: 20 } }),
    refetchInterval: 15000,
  });

  const vol = useQuery({
    enabled: !!clientId,
    queryKey: ["brand-volumetry", clientId],
    queryFn: () => getVol({ data: { clientId: clientId! } }),
  });

  const [running, setRunning] = useState(false);
  const runMonthlyPlan = useMutation({
    mutationFn: async () => {
      if (!brandId || !clientId) throw new Error("Selecione um cliente.");
      setRunning(true);
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");
      const res = await fetch("/api/jobs/monthly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brandId,
          clientId,
          postsCount: vol.data?.postsPerMonth ?? 12,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast.success("Plano do mês iniciado. Acompanhe pelo orb no header.");
      qc.invalidateQueries({ queryKey: ["agent-jobs"] });
      qc.invalidateQueries({ queryKey: ["ai-jobs", "active"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setRunning(false),
  });

  if (!brandId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Selecione um workspace para visualizar os agentes de IA.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cérebro de Agentes</h1>
          <p className="text-sm text-muted-foreground">
            Especialistas de IA orquestrados a partir do briefing da marca.
          </p>
        </div>
        {clientId ? (
          <Button
            onClick={() => runMonthlyPlan.mutate()}
            disabled={running || runMonthlyPlan.isPending}
            className="gap-2"
          >
            {running || runMonthlyPlan.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Sugerir pauta do mês ({vol.data?.postsPerMonth ?? 12} posts)
          </Button>
        ) : (
          <Badge variant="outline">Selecione um cliente para acionar a pauta</Badge>
        )}
      </header>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Brain className="h-4 w-4" /> Agentes disponíveis
        </h2>
        {prompts.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(prompts.data ?? []).map((a) => (
              <Card key={a.agent_id} className="h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium">{a.agent_name}</CardTitle>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {a.agent_id}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  <p className="line-clamp-4">{a.system_prompt.slice(0, 280)}…</p>
                </CardContent>
              </Card>
            ))}
            {(prompts.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agente cadastrado.</p>
            ) : null}
          </div>
        )}
      </section>

      <Separator />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4" /> Execuções recentes
        </h2>
        {jobs.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (jobs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma execução ainda. Comece por{" "}
            <Link to="/content" className="underline">
              Produção
            </Link>{" "}
            ou acione a pauta do mês acima.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {(jobs.data ?? []).map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {statusIcon(j.status)}
                    <span className="truncate font-medium">
                      {j.title ?? j.kind}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {j.step_label ?? j.kind} ·{" "}
                    {new Date(j.created_at).toLocaleString("pt-BR")}
                    {j.error ? ` · ${j.error}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {j.progress != null ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {j.progress}%
                    </span>
                  ) : null}
                  <Badge variant="outline" className="capitalize">
                    {j.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function statusIcon(status: string) {
  if (status === "succeeded") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}