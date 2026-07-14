import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { AlertTriangle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
  { value: "brain", label: "Cérebro da Marca" },
  { value: "production", label: "Produção" },
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
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  usePageHeader(
    {
      title: customer?.name ?? (customersQ.isLoading ? "Carregando…" : "Cliente"),
      subtitle: `${customer?.niche ?? "—"} · ${customerId.slice(0, 8)}`,
      actions: (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setSettingsOpen(true)}
          title="Configurações da conta"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      ),
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

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-background">
      <div className="w-full space-y-6 px-6 py-6 md:px-8">
        {customer === undefined && !customersQ.isLoading ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
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
            <TabsContent value="production">
              <ProductionPanel brandId={brandId} clientId={customerId} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="mb-4">
            <SheetTitle>Configurações da conta</SheetTitle>
            <SheetDescription>
              Contato, telefone, e-mail corporativo e redes sociais.
            </SheetDescription>
          </SheetHeader>
          <BasicInfoTab brandId={brandId} clientId={customerId} />
        </SheetContent>
      </Sheet>
    </ScrollArea>
  );
}

function ProductionPanel({ brandId, clientId }: { brandId: string; clientId: string }) {
  void brandId; void clientId;
  const stages = ["Ideia", "Produção", "Revisão", "Aprovado", "Agendado", "Publicado"] as const;
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((s) => (
        <div
          key={s}
          className="flex h-[60vh] w-72 shrink-0 flex-col rounded-lg border border-border/60 bg-card/40"
        >
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <div className="text-xs font-medium">{s}</div>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">0</span>
          </div>
          <div className="flex flex-1 items-center justify-center p-6 text-[11px] text-muted-foreground">
            Nenhum post neste estágio.
          </div>
        </div>
      ))}
    </div>
  );
}