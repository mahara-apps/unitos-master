import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { AlertTriangle, DollarSign, KanbanSquare, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAccessRole } from "@/hooks/use-access-role";
import { FALLBACK_ROUTE } from "@/lib/permissions";
import { toast } from "sonner";
import { listClients } from "@/lib/workspace.functions";
import {
  StrategyTab,
  TargetTab,
  MarketTab,
} from "@/components/ai-agents/strategy-panel";
import { CustomerDashboard } from "@/components/customer/customer-dashboard";
import { BasicInfoTab } from "@/components/customer/basic-info-tab";
import { BriefingWorkspace } from "@/components/brand-hub/briefing-workspace";
import {
  StrategySkeleton,
  TargetSkeleton,
  MarketSkeleton,
} from "@/components/ai-agents/tab-skeletons";
import { PipelineOnboarding } from "@/components/ai-agents/pipeline-onboarding";
import { usePageHeader } from "@/hooks/use-page-header";
import {
  CUSTOMER_QUERY_KEYS,
  customerCoreQuery,
  customerMarketQuery,
  customerPautasQuery,
  customerTargetQuery,
} from "@/lib/customer-queries";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  component: CustomerDetail,
});

const TABS = [
  { value: "overview", label: "Visão geral" },
  { value: "basic", label: "Dados básicos" },
  { value: "briefing", label: "Briefing" },
  { value: "strategy", label: "Estratégia" },
  { value: "target", label: "Público" },
  { value: "market", label: "Mercado" },
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string => !!v && UUID_RE.test(v);

function CustomerDetail() {
  const { customerId } = Route.useParams();
  const { brandId, setClientId } = useActiveContext();
  const { role, allowedClientIds, isReady } = useAccessRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (customerId) setClientId(customerId);
  }, [customerId, setClientId]);

  useEffect(() => {
    if (!isReady || !allowedClientIds) return;
    if (!allowedClientIds.has(customerId)) {
      toast.error("Acesso negado", { description: "Você não é responsável por este cliente." });
      navigate({ to: FALLBACK_ROUTE[role], replace: true });
    }
  }, [isReady, allowedClientIds, customerId, role, navigate]);

  if (!isUuid(brandId)) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Selecione um workspace no menu lateral.
        </div>
      </div>
    );
  }
  if (!isUuid(customerId)) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" /> Cliente inválido.
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<HeaderFallback />}>
      <CustomerDetailReady brandId={brandId} customerId={customerId} />
    </Suspense>
  );
}

function HeaderFallback() {
  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-background">
      <div className="w-full space-y-6 px-6 py-6 md:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-32 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </header>
        <div className="rounded-lg border border-border bg-card p-1">
          <div className="flex gap-2 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-md" />
            ))}
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </ScrollArea>
  );
}

function CustomerDetailReady({ brandId, customerId }: { brandId: string; customerId: string }) {
  const list = useServerFn(listClients);
  const qc = useQueryClient();
  const [regenOpen, setRegenOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Lista de customers do brand ativo — só para nome/cor do header.
  const customersQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId } }),
    staleTime: 60_000,
  });

  // Core suspende (rápido: briefing + voice + usage 30d em paralelo).
  // Decide se mostra onboarding, alimenta o header e o custo.
  const { data: core } = useSuspenseQuery(customerCoreQuery({ brandId, clientId: customerId }));

  // Prefetch das fatias pesadas em paralelo assim que a rota monta —
  // elimina waterfall quando o usuário troca de aba.
  useEffect(() => {
    qc.prefetchQuery(customerTargetQuery({ brandId, clientId: customerId }));
    qc.prefetchQuery(customerMarketQuery({ brandId, clientId: customerId }));
    qc.prefetchQuery(customerPautasQuery({ brandId, clientId: customerId }));
  }, [qc, brandId, customerId]);

  const cost = core.usage.totalCostUsd;
  const hasBriefing = Boolean(core.briefing);
  const showOnboarding = !hasBriefing || forceOnboarding;

  const customer = (customersQ.data ?? []).find((c) => c.id === customerId);

  usePageHeader(
    {
      title: customer?.name ?? (customersQ.isLoading ? "Carregando…" : "Cliente"),
      subtitle: `${customer?.niche ?? "—"} · ${customerId.slice(0, 8)}`,
      actions: (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
            <DollarSign className="mr-1 h-3 w-3" />
            {cost.toFixed(4)} USD · 30d
          </Badge>
          {hasBriefing ? (
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setRegenOpen(true)}>
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
      ),
    },
    [customer?.name, customer?.niche, customerId, cost, hasBriefing],
  );

  const scope = { brandId, clientId: customerId };
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.core(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.target(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.market(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.pautas(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.legacyContext(scope) });
  };

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-background">
      <div className="w-full space-y-6 px-6 py-6 md:px-8">
        {customer === undefined && !customersQ.isLoading ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            Este cliente não pertence ao workspace ativo.
          </div>
        ) : showOnboarding ? (
          <PipelineOnboarding
            brandId={brandId}
            clientId={customerId}
            onDone={() => {
              invalidateAll();
              setForceOnboarding(false);
            }}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto rounded-lg border border-border bg-card p-1">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <CustomerDashboard
                brandId={brandId}
                clientId={customerId}
                onRegenerate={() => setRegenOpen(true)}
                onOpenBriefing={() => setActiveTab("briefing")}
              />
            </TabsContent>
            <TabsContent value="basic">
              <BasicInfoTab brandId={brandId} clientId={customerId} />
            </TabsContent>
            <TabsContent value="briefing">
              <BriefingWorkspace brandId={brandId} clientId={customerId} embedded />
            </TabsContent>
            <TabsContent value="strategy">
              <Suspense fallback={<StrategySkeleton />}>
                <StrategyTab brandId={brandId} clientId={customerId} />
              </Suspense>
            </TabsContent>
            <TabsContent value="target">
              <Suspense fallback={<TargetSkeleton />}>
                <TargetTab brandId={brandId} clientId={customerId} />
              </Suspense>
            </TabsContent>
            <TabsContent value="market">
              <Suspense fallback={<MarketSkeleton />}>
                <MarketTab brandId={brandId} clientId={customerId} />
              </Suspense>
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