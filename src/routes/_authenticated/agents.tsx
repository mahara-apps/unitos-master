import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Loader2, Activity, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  listAgentPromptsFn,
  listAgentJobsFn,
  getBrandVolumetryFn,
  type AgentPromptRow,
} from "@/lib/agents.functions";
import { supabase } from "@/integrations/supabase/client";
import { usePageHeader } from "@/hooks/use-page-header";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentDrawer } from "@/components/agents/agent-drawer";
import { JobsTable } from "@/components/agents/jobs-table";
import { getAgentMeta } from "@/components/agents/agent-meta";

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
  const [selected, setSelected] = useState<AgentPromptRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openAgent = (a: AgentPromptRow) => {
    setSelected(a);
    setDrawerOpen(true);
  };

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of prompts.data ?? []) {
      const c = getAgentMeta(a.agent_id, a.agent_name).categoryLabel;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [prompts.data]);

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

  const monthlyAction = clientId ? (
    <Button
      size="sm"
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
  );

  usePageHeader(
    {
      title: "Cérebro de Agentes",
      subtitle: "Especialistas de IA orquestrados a partir do briefing da marca.",
      actions: monthlyAction,
    },
    [clientId, running, runMonthlyPlan.isPending, vol.data?.postsPerMonth],
  );

  if (!brandId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Selecione um workspace para visualizar os agentes de IA.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-8 p-6">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4" /> Agentes disponíveis
            <span className="text-muted-foreground">
              · {prompts.data?.length ?? 0}
            </span>
          </div>
          <div className="hidden gap-1.5 md:flex">
            {categoryCounts.map(([label, n]) => (
              <Badge key={label} variant="outline" className="h-5 text-[10px]">
                {label} · {n}
              </Badge>
            ))}
          </div>
        </div>
        {prompts.isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-lg border bg-muted/30"
              />
            ))}
          </div>
        ) : (prompts.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agente cadastrado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(prompts.data ?? []).map((a) => (
              <AgentCard key={a.agent_id} agent={a} onOpen={openAgent} />
            ))}
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
          <JobsTable jobs={jobs.data ?? []} />
        )}
      </section>

      <AgentDrawer
        agent={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}