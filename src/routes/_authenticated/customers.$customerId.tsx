import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { MonthlyPlanView } from "@/components/monthly-plan/monthly-plan-view";
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
import { StrategyResults } from "@/components/ai-agents/strategy-results";
import { CustomerOverview } from "@/components/customer/overview/customer-overview";
import { ProductionTab } from "@/components/customer/production/production-tab";
import { BasicInfoTab } from "@/components/customer/basic-info-tab";
import { ChannelsTab } from "@/components/customer/channels-tab";
import { AccountManagementTab } from "@/components/customer/account-management-tab";
import { BriefingWorkspace } from "@/components/brand-hub/briefing-workspace";
import { QuickOnboardingWizard } from "@/components/brand-hub/quick-onboarding-wizard";
import { getBrandHub } from "@/lib/brand-hub.functions";
import { computeBriefingCompletion } from "@/lib/briefing-progress";
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
      .object({
        onboarding: z.union([z.literal("1"), z.literal(1), z.boolean()]).optional(),
        planId: z.string().uuid().optional(),
        tab: z
          .enum([
            "overview",
            "briefing",
            "estrategia",
            "pauta",
            "producao",
            "channels",
            "conta",
            // Aliases legados de links internos → resolvidos para "conta".
            "cadastro",
            "gestao",
          ])
          .optional(),
      })
      .parse(s),
  component: CustomerDetail,
});

type CustomerTab =
  | "overview"
  | "briefing"
  | "estrategia"
  | "pauta"
  | "producao"
  | "channels"
  | "conta"
  | "cadastro"
  | "gestao";

/** Abas legadas que hoje vivem dentro da aba única "Conta". */
const TAB_ALIASES: Partial<Record<CustomerTab, CustomerTab>> = {
  cadastro: "conta",
  gestao: "conta",
};

const resolveTab = (tab?: string): string =>
  (tab && TAB_ALIASES[tab as CustomerTab]) || tab || "overview";

const ALL_TABS = [
  { value: "overview", label: "Visão geral" },
  { value: "briefing", label: "Briefing" },
  { value: "estrategia", label: "Estratégia IA" },
  { value: "pauta", label: "Pauta" },
  { value: "producao", label: "Produção" },
  { value: "channels", label: "Canais" },
  { value: "conta", label: "Conta" },
] as const;


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string => !!v && UUID_RE.test(v);

function CustomerDetail() {
  const { customerId } = Route.useParams();
  const { onboarding, tab, planId } = Route.useSearch();
  const { brandId, setClientId } = useActiveContext();
  const { role, allowedClientIds, isReady } = useAccessRole();
  const navigate = useNavigate();

  // O escopo do painel é sempre o `customerId` validado da rota — nunca o
  // clientId "ambiente". Só espelhamos no contexto ativo quando o acesso já
  // foi confirmado (efeito abaixo, após a checagem de responsabilidade).
  const denied = isReady && !!allowedClientIds && !allowedClientIds.has(customerId);
  const allowed = isReady && !denied && isUuid(customerId);

  useEffect(() => {
    if (allowed) setClientId(customerId);
  }, [allowed, customerId, setClientId]);

  useEffect(() => {
    if (!denied) return;
    toast.error("Acesso negado", { description: "Você não é responsável por este cliente." });
    navigate({ to: FALLBACK_ROUTE[role], replace: true });
  }, [denied, role, navigate]);

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

  // Nada de dado protegido é montado antes da validação de escopo terminar.
  if (!isReady) return <HeaderFallback />;
  if (denied) {
    return (
      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          Você não é responsável por este cliente. Redirecionando…
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
        initialTab={tab}
        initialPlanId={planId}
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
  initialTab,
  initialPlanId,
}: {
  brandId: string;
  customerId: string;
  openOnboarding: boolean;
  initialTab?: CustomerTab;
  initialPlanId?: string;
}) {
  const list = useServerFn(listClients);
  const fetchHub = useServerFn(getBrandHub);
  const qc = useQueryClient();
  const TABS = ALL_TABS;
  const [activeTab, setActiveTab] = useState<string>(resolveTab(initialTab));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [planId, setPlanIdState] = useState<string | null>(initialPlanId ?? null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Sincroniza com ?tab=... (links internos como "Editar em Cadastro").
  useEffect(() => {
    if (initialTab) setActiveTab(resolveTab(initialTab));
  }, [initialTab]);


  // Troca de aba mantém a URL compartilhável (?tab=...).
  const goToTab = (value: string) => {
    const next = resolveTab(value);
    setActiveTab(next);
    navigate({
      to: "/customers/$customerId",
      params: { customerId },
      search: { tab: next, ...(next === "pauta" && planId ? { planId } : {}) } as never,
      replace: true,
    });
  };


  const setPlanId = (id: string | null) => {
    setPlanIdState(id);
    navigate({
      to: "/customers/$customerId",
      params: { customerId },
      search: { tab: "pauta", ...(id ? { planId: id } : {}) } as never,
      replace: true,
    });
  };

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
      setActiveTab("briefing");
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
      subtitle: customer?.niche ?? "—",
    },
    [customer?.name, customer?.niche, customerId],
  );

  const scope = { brandId, clientId: customerId };
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.core(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.target(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.market(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.pautas(scope) });
    qc.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.legacyContext(scope) });
  };

  // Sub-rotas do painel (brain, media-plan) renderizam sozinhas.
  const isChildRoute = pathname.replace(/\/+$/, "") !== `/customers/${customerId}`;
  if (isChildRoute) return <Outlet />;

  const initials = (customer?.name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-background">
      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {customer === undefined && !customersQ.isLoading ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Este cliente não pertence ao workspace ativo.
          </div>
        ) : (
          <>
            {/* Faixa de identidade do cliente */}
            <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/10 via-card to-card px-4 py-4 sm:px-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-base font-semibold text-primary ring-1 ring-primary/25">
                {initials || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold tracking-tight">
                  {customer?.name ?? (customersQ.isLoading ? "Carregando…" : "Cliente")}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {customer?.niche ?? "Sem nicho definido"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {needsOnboarding && (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => {
                      goToTab("briefing");
                      setWizardOpen(true);
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Completar onboarding
                  </Button>
                )}
              </div>
            </header>

            <Tabs value={activeTab} onValueChange={goToTab} className="space-y-4">
              <TabsList variant="bordered" className="flex-wrap">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                  >
                    {t.label}
                    {t.value === "briefing" && needsOnboarding && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="overview">
                <CustomerOverview
                  brandId={brandId}
                  clientId={customerId}
                  onOpenBriefing={() => goToTab("briefing")}
                  onOpenTab={goToTab}
                />
              </TabsContent>

              <TabsContent value="briefing">
                <BriefingWorkspace
                  brandId={brandId}
                  clientId={customerId}
                  embedded
                  layout="stacked"
                  onStrategyGenerated={() => {
                    invalidateAll();
                    qc.invalidateQueries({
                      queryKey: ["strategy-runs", brandId, customerId],
                    });
                  }}
                />
              </TabsContent>
              <TabsContent value="estrategia">
                <StrategyResults
                  brandId={brandId}
                  clientId={customerId}
                  onGenerate={() => goToTab("briefing")}
                  onRestored={invalidateAll}
                />
              </TabsContent>
              <TabsContent value="pauta">
                <MonthlyPlanView
                  brandId={brandId}
                  clientId={customerId}
                  planId={planId}
                  onSelectPlan={setPlanId}
                />
              </TabsContent>

              <TabsContent value="producao">
                <ProductionTab brandId={brandId} clientId={customerId} />
              </TabsContent>

              <TabsContent value="cadastro">
                <BasicInfoTab brandId={brandId} clientId={customerId} />
              </TabsContent>
              <TabsContent value="gestao">
                <AccountManagementTab brandId={brandId} clientId={customerId} />
              </TabsContent>
              <TabsContent value="channels">
                <ChannelsTab brandId={brandId} clientId={customerId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <QuickOnboardingWizard
        brandId={brandId}
        clientId={customerId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onOpenFullBriefing={() => setActiveTab("briefing")}
      />
    </ScrollArea>
  );
}
