import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { QuickOnboardingWizard } from "@/components/brand-hub/quick-onboarding-wizard";
import { getBrandHub } from "@/lib/brand-hub.functions";
import { computeBriefingCompletion } from "@/lib/briefing-progress";
import {
  StrategySkeleton,
  TargetSkeleton,
  MarketSkeleton,
} from "@/components/ai-agents/tab-skeletons";
import { usePageHeader } from "@/hooks/use-page-header";
import {
  CUSTOMER_QUERY_KEYS,
  customerCoreQuery,
  customerMarketQuery,
  customerPautasQuery,
  customerTargetQuery,
} from "@/lib/customer-queries";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  validateSearch: (s) =>
    z
      .object({ onboarding: z.union([z.literal("1"), z.literal(1), z.boolean()]).optional() })
      .parse(s),
  component: CustomerDetail,
});

const TABS = [
  { value: "overview", label: "Visão geral" },
  { value: "brain", label: "Cérebro da Marca" },
  { value: "cadastro", label: "Cadastro" },
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string => !!v && UUID_RE.test(v);

function CustomerDetail() {
  const { customerId } = Route.useParams();
  const { onboarding } = Route.useSearch();
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
      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
          Selecione um workspace no menu lateral.
        </div>
      </div>
    );
  }
  if (!isUuid(customerId)) {
    return (
      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          Cliente inválido.
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<HeaderFallback />}>
      <CustomerDetailReady
        brandId={brandId}
        customerId={customerId}
        openOnboarding={!!onboarding}
      />
    </Suspense>
  );
}

function HeaderFallback() {
  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-background">
      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </header>
        <div className="rounded-lg border border-border/60 bg-card p-1">
          <div className="flex gap-2 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-md" />
            ))}
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </ScrollArea>
  );
}

function CustomerDetailReady({
  brandId,
  customerId,
  openOnboarding,
}: {
  brandId: string;
  customerId: string;
  openOnboarding: boolean;
}) {
  const list = useServerFn(listClients);
  const fetchHub = useServerFn(getBrandHub);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [wizardOpen, setWizardOpen] = useState(false);
  const navigate = useNavigate();

  // Lista de customers do brand ativo — só para nome/cor do header.
  const customersQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId } }),
    staleTime: 60_000,
  });

  // Core suspende (rápido: briefing + voice + usage 30d em paralelo) — apenas para
  // pré-aquecer o cache das outras abas e alimentar o dashboard.
  useSuspenseQuery(customerCoreQuery({ brandId, clientId: customerId }));

  // Prefetch das fatias pesadas em paralelo assim que a rota monta —
  // elimina waterfall quando o usuário troca de aba.
  useEffect(() => {
    qc.prefetchQuery(customerTargetQuery({ brandId, clientId: customerId }));
    qc.prefetchQuery(customerMarketQuery({ brandId, clientId: customerId }));
    qc.prefetchQuery(customerPautasQuery({ brandId, clientId: customerId }));
  }, [qc, brandId, customerId]);

  const customer = (customersQ.data ?? []).find((c) => c.id === customerId);

  const hubQ = useQuery({
    queryKey: ["brand-hub", brandId, customerId],
    queryFn: () => fetchHub({ data: { brandId, clientId: customerId } }),
    staleTime: 30_000,
  });
  const completion = hubQ.data
    ? computeBriefingCompletion(hubQ.data.brand_hub ?? {}, hubQ.data)
    : 0;
  const needsOnboarding = !!hubQ.data && completion < 60;

  // Auto-open when the customer was just created (?onboarding=1).
  useEffect(() => {
    if (openOnboarding) {
      setWizardOpen(true);
      setActiveTab("brain");
      // Clear the query param so a manual refresh doesn't reopen it.
      navigate({
        to: "/customers/$customerId",
        params: { customerId },
        search: {},
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnboarding, customerId]);

  // Bridge from "Editar em Cadastro" link inside Cérebro tab.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setActiveTab(detail);
    };
    window.addEventListener("nx:switch-customer-tab", handler);
    return () => window.removeEventListener("nx:switch-customer-tab", handler);
  }, []);

  usePageHeader(
    {
      title: customer?.name ?? (customersQ.isLoading ? "Carregando…" : "Cliente"),
      subtitle: `${customer?.niche ?? "—"} · ${customerId.slice(0, 8)}`,
      actions: (
        <div className="flex items-center gap-1">
          {needsOnboarding && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10 hover:text-fuchsia-200"
              onClick={() => {
                setActiveTab("brain");
                setWizardOpen(true);
              }}
              title="Completar onboarding rápido"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Completar onboarding
            </Button>
          )}
        </div>
      ),
    },
    [customer?.name, customer?.niche, customerId, needsOnboarding],
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
      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {customer === undefined && !customersQ.isLoading ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Este cliente não pertence ao workspace ativo.
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList variant="bordered">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <CustomerDashboard
                brandId={brandId}
                clientId={customerId}
                onOpenBriefing={() => setActiveTab("brain")}
              />
            </TabsContent>
            <TabsContent value="brain">
              <BriefingWorkspace
                brandId={brandId}
                clientId={customerId}
                embedded
                layout="stacked"
                onStrategyGenerated={invalidateAll}
                appendSlot={
                  <>
                    <section id="estrategia" className="scroll-mt-24 space-y-4">
                      <h3 className="text-lg font-semibold tracking-tight">Estratégia IA</h3>
                      <Suspense fallback={<StrategySkeleton />}>
                        <StrategyTab brandId={brandId} clientId={customerId} />
                      </Suspense>
                    </section>
                    <section id="personas" className="scroll-mt-24 space-y-4">
                      <h3 className="text-lg font-semibold tracking-tight">Personas & Público IA</h3>
                      <Suspense fallback={<TargetSkeleton />}>
                        <TargetTab brandId={brandId} clientId={customerId} />
                      </Suspense>
                    </section>
                    <section id="mercado" className="scroll-mt-24 space-y-4">
                      <h3 className="text-lg font-semibold tracking-tight">Análise de Mercado</h3>
                      <Suspense fallback={<MarketSkeleton />}>
                        <MarketTab brandId={brandId} clientId={customerId} />
                      </Suspense>
                    </section>
                  </>
                }
              />
            </TabsContent>
            <TabsContent value="cadastro">
              <BasicInfoTab brandId={brandId} clientId={customerId} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <QuickOnboardingWizard
        brandId={brandId}
        clientId={customerId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onOpenFullBriefing={() => setActiveTab("brain")}
      />
    </ScrollArea>
  );
}
