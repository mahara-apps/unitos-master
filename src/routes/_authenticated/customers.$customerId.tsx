import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, DollarSign, KanbanSquare, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients } from "@/lib/workspace.functions";
import { loadClientContextFn } from "@/lib/ai-agents.functions";
import { useClientContext } from "@/components/ai-agents/agent-tabs";
import {
  OverviewTab,
  StrategyTab,
  TargetTab,
  MarketTab,
  TopicsTab,
} from "@/components/ai-agents/strategy-panel";
import { PipelineOnboarding } from "@/components/ai-agents/pipeline-onboarding";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  component: CustomerDetail,
});

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "strategy", label: "Strategy" },
  { value: "target", label: "Target" },
  { value: "market", label: "Market" },
  { value: "topics", label: "Topics" },
] as const;

function CustomerDetail() {
  const { customerId } = Route.useParams();
  const { brandId, setClientId } = useActiveContext();
  const list = useServerFn(listClients);
  const load = useServerFn(loadClientContextFn);
  const [regenOpen, setRegenOpen] = useState(false);

  const customersQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });
  const ctxQ = useQuery({
    queryKey: ["client-ai-context", brandId, customerId],
    queryFn: () => load({ data: { brandId: brandId!, clientId: customerId } }),
    enabled: !!brandId,
  });

  useEffect(() => {
    if (customerId) setClientId(customerId);
  }, [customerId, setClientId]);

  const { ctx, invalidate } = useClientContext(brandId ?? "", customerId);
  const cost = ctxQ.data?.usage.totalCostUsd ?? 0;
  const hasBriefing = Boolean(ctxQ.data?.briefing);
  const loadingCtx = ctxQ.isLoading;
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const showOnboarding = !hasBriefing || forceOnboarding;

  if (!brandId) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Selecione um workspace no menu lateral.
        </div>
      </div>
    );
  }

  const customer = (customersQ.data ?? []).find((c) => c.id === customerId);

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-zinc-950">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: customer?.color ?? "#6366f1" }}
            >
              {(customer?.name ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                cliente · workspace
              </div>
              <h1 className="mt-0.5 text-2xl font-semibold">
                {customer?.name ?? (customersQ.isLoading ? "carregando…" : "cliente não encontrado")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {customer?.niche ?? "—"} · <span className="font-mono">{customerId.slice(0, 8)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
              <DollarSign className="mr-1 h-3 w-3" />
              {cost.toFixed(4)} USD · 30d
            </Badge>
            {hasBriefing ? (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground hover:text-neutral-100"
                onClick={() => setRegenOpen(true)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate Strategy
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/customers/$customerId/pipeline" params={{ customerId }}>
                <KanbanSquare className="h-3.5 w-3.5" />
                Pipeline
              </Link>
            </Button>
          </div>
        </header>

        {customer === undefined && !customersQ.isLoading ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
            Este cliente não pertence ao workspace ativo.
          </div>
        ) : loadingCtx ? (
          <div className="rounded-xl border border-white/10 bg-neutral-950/60 p-10 text-center text-xs text-muted-foreground">
            Carregando inteligência do cliente…
          </div>
        ) : showOnboarding ? (
          <PipelineOnboarding
            brandId={brandId}
            clientId={customerId}
            onDone={() => {
              invalidate();
              ctxQ.refetch();
              setForceOnboarding(false);
            }}
          />
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto rounded-lg border border-white/10 bg-neutral-900/60 p-1">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="text-xs data-[state=active]:bg-white/10"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <OverviewTab ctx={ctx} />
            </TabsContent>
            <TabsContent value="strategy">
              <StrategyTab ctx={ctx} />
            </TabsContent>
            <TabsContent value="target">
              <TargetTab ctx={ctx} />
            </TabsContent>
            <TabsContent value="market">
              <MarketTab ctx={ctx} />
            </TabsContent>
            <TabsContent value="topics">
              <TopicsTab brandId={brandId} clientId={customerId} />
            </TabsContent>
          </Tabs>
        )}

        <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate strategy?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso abre o formulário de onboarding novamente para rodar o pipeline
                de IA. Os artefatos anteriores permanecem no histórico — os novos
                se tornam a versão ativa.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setForceOnboarding(true);
                  setRegenOpen(false);
                }}
              >
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ScrollArea>
  );
}