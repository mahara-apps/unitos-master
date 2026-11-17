import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Coins,
  Cpu,
  DollarSign,
  KeyRound,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiHealthBanner } from "./ai-health-banner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardPanelSurface } from "@/components/ui/dashboard-primitives";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
import { supportsKind, type ProviderName as AiProviderName } from "@/lib/ai-capabilities";
import { aiErrorMessage } from "@/lib/ai-error-display";
import { AiFinanceAlerts } from "./ai-finance-alerts";

import { getAiModelStatus, runAiModelHealthNow } from "@/lib/ai-models.functions";
import { saveProviderKey, testProviderKey, removeProviderKey } from "@/lib/connections.functions";
import { cn } from "@/lib/utils";
import { orderedUsableEmbeddingProviders } from "@/lib/ai-provider-availability";
import { formatDateTimeBr } from "@/lib/timezone";

export type AiProviderId = "openai" | "anthropic" | "gemini" | "groq";

type ProviderDef = {
  id: AiProviderId;
  name: string;
  hint: string;
  tone: string;
  docs: string;
  icon: ComponentType<{ className?: string }>;
  models: Array<{ id: string; label: string; kind: "text" }>;
};

export const AI_PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    hint: "GPT-6 Astra · GPT-6.1 Sol",
    tone: "text-emerald-500",
    docs: "platform.openai.com",
    icon: Sparkles,
    models: [
      { id: "gpt-6-astra", label: "GPT-6 Astra", kind: "text" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", kind: "text" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    hint: "Claude Sonnet · Claude Opus",
    tone: "text-amber-500",
    docs: "console.anthropic.com",
    icon: Brain,
    models: [
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", kind: "text" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", kind: "text" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    hint: "Gemini",
    tone: "text-sky-500",
    docs: "aistudio.google.com",
    icon: Cpu,
    models: [
      { id: "gemini-flash-latest", label: "Gemini Flash (mais recente)", kind: "text" },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", kind: "text" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    hint: "GPT-OSS (reserva)",
    tone: "text-orange-500",
    docs: "console.groq.com",
    icon: Zap,
    models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", kind: "text" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", kind: "text" },
    ],
  },
];

const PROVIDER_BY_ID = Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, p])) as Record<
  AiProviderId,
  ProviderDef
>;

type ProviderConfig = {
  connected: boolean;
  masked?: string;
  updatedAt?: string;
  verified?: "valid" | "invalid" | "unverified";
  verifiedAt?: string;
  verifyMessage?: string;
};

/** Chave que existe mas não pode ser aberta nesta instalação. */
const UNREADABLE_KEY_RE = /não pôde ser lida/i;

function isUnreadableKey(config?: ProviderConfig) {
  return config?.verified === "invalid" && UNREADABLE_KEY_RE.test(config.verifyMessage ?? "");
}

function keyStateLabel(config?: ProviderConfig) {
  if (config?.verified === "valid") return "Chave válida";
  if (config?.verified === "invalid")
    return isUnreadableKey(config) ? "Precisa salvar a chave novamente" : "Chave inválida";
  return "Chave não verificada";
}

/** Nome amigável de um modelo, quando ele estiver no catálogo da tela. */
function modelLabel(providerId: string, modelId: string) {
  const def = PROVIDER_BY_ID[providerId as AiProviderId];
  return def?.models.find((m) => m.id === modelId)?.label ?? modelId;
}

function providerLabel(providerId: string) {
  return PROVIDER_BY_ID[providerId as AiProviderId]?.name ?? providerId;
}

type ProviderUse = "primary" | "fallback" | "standby" | "none";
type ActiveModels = Partial<Record<"strategic" | "operational", string>>;

const ROLE_LABEL: Record<"strategic" | "operational", string> = {
  strategic: "Estratégia",
  operational: "Dia a dia",
};

/** Papel real de cada provedor, pela mesma regra usada na geração. */
function providerUse(
  id: AiProviderId,
  data: AiCenterData | undefined,
): ProviderUse {
  const connected = data?.providers?.[id]?.connected === true;
  if (!connected) return "none";
  if (id === data?.textProvider) return "primary";
  if (id === "groq" && data?.textFallbackProvider === "groq") return "fallback";
  return "standby";
}

/** Provedor que gera a memória da IA (embeddings), pela regra do servidor. */
function embeddingProvider(data: AiCenterData | undefined): AiProviderId | null {
  const providers = data?.providers ?? {};
  const connected = Object.entries(providers)
    .filter(([, v]) => v?.connected)
    .map(([k]) => k);
  return (
    orderedUsableEmbeddingProviders({
      primary: data?.textProvider,
      providers,
      credentialProviders: connected,
      allowed: ["openai", "gemini"],
    })[0] ?? null
  );
}

export type AiCenterData = {
  monthlyBudgetUsd?: number;
  textProvider?: AiProviderId;
  textFallbackProvider?: AiProviderId | "none";
  providers?: Partial<Record<AiProviderId, ProviderConfig>>;
  recentUnavailable?: Record<string, number>;
  usage: {
    monthUsd: number;
    monthTokens: number;
    totalCalls: number;
    successCalls: number;
    byProvider?: Record<string, { usd: number; tokens: number; calls: number }>;
  };
};

export type AiSettingsUpdate = {
  monthlyBudgetUsd?: number;
  textProvider?: AiProviderId;
};

/**
 * Central de IA — apresentação apenas. Todas as regras (chaves, consumo,
 * fallback, custo) continuam nas server functions já existentes.
 */
export function AiCenter({
  brandId,
  data,
  isLoading,
  onChanged,
  onUpdateSettings,
  isSaving,
}: {
  brandId: string;
  data: AiCenterData | undefined;
  isLoading: boolean;
  onChanged: () => void;
  onUpdateSettings: (input: AiSettingsUpdate) => void;
  isSaving: boolean;
}) {
  const [tab, setTab] = useState("overview");

  const budget = data?.monthlyBudgetUsd ?? 500;
  const used = data?.usage.monthUsd ?? 0;
  const pct = budget > 0 ? Math.round((used / budget) * 100) : 0;
  const totalCalls = data?.usage.totalCalls ?? 0;
  const successCalls = data?.usage.successCalls ?? 0;
  const successRate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;
  const noUsage = !isLoading && totalCalls === 0;
  const byProvider = data?.usage.byProvider ?? {};

  const textProvider = (data?.textProvider ?? "openai") as AiProviderId;
  const primaryName = data?.textProvider ? PROVIDER_BY_ID[data.textProvider]?.name : undefined;
  const primaryReady = !!data?.textProvider && data?.providers?.[data.textProvider]?.connected === true;
  const fallbackReady = data?.textFallbackProvider === "groq" && data?.providers?.groq?.connected === true;
  const embedId = embeddingProvider(data);

  const statusFn = useServerFn(getAiModelStatus);
  const { data: modelStatus } = useQuery({
    queryKey: ["ai-model-status", brandId],
    queryFn: () => statusFn({ data: { brandId } }),
    staleTime: 5 * 60 * 1000,
  });
  const activeModels = (id: AiProviderId): ActiveModels => {
    const out: ActiveModels = {};
    for (const m of modelStatus?.models ?? []) if (m.provider === id) out[m.role] = m.modelId;
    return out;
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList variant="bordered">
        <TabsTrigger value="overview">Visão geral</TabsTrigger>
        <TabsTrigger value="providers">Provedores</TabsTrigger>
        <TabsTrigger value="models">Modelos</TabsTrigger>
        <TabsTrigger value="config">Configuração</TabsTrigger>
      </TabsList>

      {/* ------------------------------- Visão geral ------------------------ */}
      <TabsContent value="overview" className="space-y-4">
        {!isLoading && data && (
          <AiHealthBanner primary={data.textProvider} providers={data.providers} recentUnavailable={data.recentUnavailable} />
        )}
        <AiFinanceAlerts brandId={brandId} spent={used} budget={budget} />
        <PageKpiGrid columns={4}>
          <PageKpi
            icon={<DollarSign />}
            label="Consumo no mês"
            value={isLoading ? "—" : `$${used.toFixed(2)}`}
            description={
              budget <= 0 ? "Sem orçamento definido" : noUsage
                ? "Sem chamadas registradas neste mês"
                : `de $${budget.toFixed(0)} · ${pct}% do orçamento`
            }
            status={noUsage ? "neutral" : pct >= 80 ? "warning" : "success"}
            trailing="USD"
          />
          <PageKpi
            icon={<Coins />}
            label="Tokens utilizados"
            value={isLoading ? "—" : (data?.usage.monthTokens ?? 0).toLocaleString("pt-BR")}
            description={noUsage ? "Nenhum token consumido ainda" : "Entrada + saída"}
            status={noUsage ? "neutral" : "info"}
          />
          <PageKpi
            icon={<Activity />}
            label="Chamadas de IA"
            value={isLoading ? "—" : totalCalls.toLocaleString("pt-BR")}
            description={noUsage ? "Aguardando a primeira geração" : `${successCalls} com sucesso`}
            status={noUsage ? "neutral" : "info"}
          />
          <PageKpi
            icon={<CheckCircle2 />}
            label="Taxa de sucesso"
            value={noUsage ? "—" : `${successRate}%`}
            description={noUsage ? "Sem histórico no mês" : "Chamadas concluídas sem erro"}
            status={
              noUsage
                ? "neutral"
                : successRate >= 95
                  ? "success"
                  : successRate >= 80
                    ? "warning"
                    : "danger"
            }
          />
        </PageKpiGrid>

        <DashboardPanelSurface className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Configuração atual</div>
              <p className="text-xs text-muted-foreground">
                Quem escreve os textos, quem assume se ela falhar e o limite de gasto.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setTab("config")}>
              <Settings2 className="mr-2 h-3.5 w-3.5" />
              Editar configuração
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryRow
              label="IA principal (textos)"
              value={primaryName ? (primaryReady ? primaryName : `${primaryName} · sem chave`) : "Nenhuma selecionada"}
            />
            <SummaryRow
              label="Reserva automática"
              value={fallbackReady ? "Groq · só se a principal falhar" : "Não configurada"}
            />
            <SummaryRow
              label="Memória da IA"
              value={embedId ? PROVIDER_BY_ID[embedId].name : "Sem OpenAI/Gemini conectado"}
            />
            <SummaryRow label="Orçamento mensal" value={budget > 0 ? `US$ ${budget.toFixed(0)}` : "Sem orçamento definido"} />
          </div>
        </DashboardPanelSurface>

        <HealthPanel brandId={brandId} providers={data?.providers} />
      </TabsContent>

      {/* -------------------------------- Provedores ------------------------ */}
      <TabsContent value="providers" className="space-y-3">
        <AiFinanceAlerts brandId={brandId} spent={used} budget={budget} />
        {!isLoading && data && (
          <AiHealthBanner primary={data.textProvider} providers={data.providers} recentUnavailable={data.recentUnavailable} />
        )}
        <div>
          <div className="text-sm font-semibold">Provedores de IA</div>
          <p className="text-xs text-muted-foreground">
            Todos os textos são escritos pela IA principal. A reserva só entra se a principal
            falhar. Provedores em espera ficam conectados, mas não escrevem textos.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SummaryRow
            label="IA principal"
            value={primaryName ? (primaryReady ? primaryName : `${primaryName} · sem chave`) : "Nenhuma selecionada"}
          />
          <SummaryRow label="Reserva automática" value={fallbackReady ? "Groq" : "Não configurada"} />
          <SummaryRow label="Memória da IA" value={embedId ? PROVIDER_BY_ID[embedId].name : "—"} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {AI_PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              config={data?.providers?.[p.id]}
              brandId={brandId}
              onChanged={onChanged}
              usage={byProvider[p.id] ?? { usd: 0, tokens: 0, calls: 0 }}
              use={providerUse(p.id, data)}
              usedForMemory={embedId === p.id}
              activeModels={activeModels(p.id)}
              onMakePrimary={
                p.id !== "groq" && providerUse(p.id, data) === "standby"
                  ? () => onUpdateSettings({ textProvider: p.id })
                  : undefined
              }
              isSaving={isSaving}
            />
          ))}
        </div>
      </TabsContent>

      {/* --------------------------------- Modelos -------------------------- */}
      <TabsContent value="models" className="space-y-3">
        <div>
          <div className="text-sm font-semibold">Modelos disponíveis</div>
          <p className="text-xs text-muted-foreground">
            Cada provedor usa um modelo para estratégia e outro para o dia a dia. Os modelos de
            reserva só entram se o modelo em uso sair do ar.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {AI_PROVIDERS.map((p) => {
            const connected = !!data?.providers?.[p.id]?.connected;
            return (
              <DashboardPanelSurface key={p.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p.icon className={cn("h-4 w-4", p.tone)} />
                    <span className="text-xs font-semibold">{p.name}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-widest",
                      connected ? "text-health-good" : "text-muted-foreground",
                    )}
                  >
                    {connected ? "Conectado" : "Não conectado"}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {p.models.map((m) => {
                    const roles = (Object.entries(activeModels(p.id)) as Array<["strategic" | "operational", string]>)
                      .filter(([, id]) => id === m.id)
                      .map(([r]) => ROLE_LABEL[r]);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-foreground/90">{m.label}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[9px] uppercase",
                            roles.length > 0 && "border-health-good/30 text-health-good",
                          )}
                        >
                          {roles.length > 0 ? `Em uso · ${roles.join(" e ")}` : "Reserva do provedor"}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </DashboardPanelSurface>
            );
          })}
        </div>
      </TabsContent>

      {/* ----------------------------- Configuração ------------------------- */}
      <TabsContent value="config" className="space-y-3">
        <AiFinanceAlerts brandId={brandId} spent={used} budget={budget} configuration />
        <ConfigForm
          textProvider={textProvider}
          groqConnected={data?.providers?.groq?.connected === true}
          budget={budget}
          isSaving={isSaving}
          onSave={onUpdateSettings}
        />
      </TabsContent>
    </Tabs>
  );
}

/* -------------------------------------------------------------------------- */

function SummaryRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function ConfigForm({
  textProvider,
  groqConnected,
  budget,
  isSaving,
  onSave,
}: {
  textProvider: AiProviderId;
  groqConnected: boolean;
  budget: number;
  isSaving: boolean;
  onSave: (input: AiSettingsUpdate) => void;
}) {
  const [text, setText] = useState<AiProviderId>(textProvider);
  const [limit, setLimit] = useState<string>(String(budget));

  useEffect(() => {
    setText(textProvider);
    setLimit(String(budget));
  }, [textProvider, budget]);

  const textOptions = AI_PROVIDERS.filter(
    (p) => supportsKind(p.id as AiProviderName, "text") && p.id !== "groq",
  );

  return (
    <DashboardPanelSurface className="p-4">
      <div>
        <div className="text-sm font-semibold">Configuração de uso</div>
        <p className="text-xs text-muted-foreground">
          Define quais provedores o Unitos usa e quanto pode gastar por mês.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="IA principal (textos)"
          hint="Escreve todos os textos. Ao conectar uma chave válida de OpenAI, Anthropic ou Gemini, ela vira a principal automaticamente."
        >
          <Select value={text} onValueChange={(v) => setText(v as AiProviderId)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {textOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Reserva automática" hint="Só entra se a IA principal falhar. Ativada ao conectar uma chave Groq válida.">
          <div className="flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm">
            {groqConnected ? "Groq · só se a principal falhar" : "Groq · não configurado"}
          </div>
        </Field>

        <Field label="Limite mensal (USD)">
          <Input
            type="number"
            min={0}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="h-9 tabular-nums"
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          disabled={isSaving}
          onClick={() => {
            const n = Number(limit);
            const payload: AiSettingsUpdate = {
              textProvider: text,
            };
            if (Number.isFinite(n) && n >= 0) payload.monthlyBudgetUsd = n;
            onSave(payload);
          }}
        >
          Salvar configuração
        </Button>
      </div>
    </DashboardPanelSurface>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function HealthPanel({
  brandId,
  providers,
}: {
  brandId: string;
  providers: Partial<Record<AiProviderId, ProviderConfig>> | undefined;
}) {
  const statusFn = useServerFn(getAiModelStatus);
  const runFn = useServerFn(runAiModelHealthNow);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["ai-model-status", brandId],
    queryFn: () => statusFn({ data: { brandId } }),
    staleTime: 5 * 60 * 1000,
  });

  const [lastRun, setLastRun] = useState<string | null>(null);

  const runMut = useMutation({
    mutationFn: () => runFn({ data: { brandId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ai-model-status", brandId] });
      setLastRun(res.checkedAt);
      const noKeys =
        res.skipped > 0
          ? ` · ${res.skippedProviders.length} fornecedor(es) sem chave configurada`
          : "";
      if (res.replacements > 0) {
        toast.success(`${res.replacements} modelo(s) atualizado(s) automaticamente${noKeys}`);
      } else if (res.problems > 0) {
        toast.error(`${res.problems} modelo(s) com falha — veja as notificações${noKeys}`);
      } else {
        toast.success(`Todos os modelos ativos${noKeys}`);
      }
    },
    onError: (e: unknown) => toast.error(aiErrorMessage(e, "Falha ao verificar modelos")),
  });

  const connectedProviders = AI_PROVIDERS.filter((p) => providers?.[p.id]?.connected);
  const missingKeyProviders = AI_PROVIDERS.filter((p) => !providers?.[p.id]?.connected);
  const connectedIds = new Set(connectedProviders.map((p) => p.id));
  const replaced = (data?.models ?? []).filter(
    (m) => m.replacedModelId && connectedIds.has(m.provider),
  );
  const lastCheckedAt = lastRun ?? data?.lastCheckedAt ?? null;

  return (
    <DashboardPanelSurface className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Saúde da IA</div>
          <p className="text-xs text-muted-foreground">
            {lastCheckedAt
              ? `Última verificação: ${formatDateTimeBr(lastCheckedAt)}`
              : "Nunca verificado"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
        >
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", runMut.isPending && "animate-spin")} />
          Verificar agora
        </Button>
      </div>

      {connectedProviders.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nenhum provedor conectado ainda.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {connectedProviders.map((p) => {
            const c = providers?.[p.id];
            const ok = c?.verified === "valid";
            const bad = c?.verified === "invalid";
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        ok
                          ? "bg-health-good"
                          : bad
                            ? "bg-severity-critical"
                            : "bg-severity-warning",
                      )}
                    />
                    {p.name}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {keyStateLabel(c)}
                    {c?.verifiedAt ? ` · ${formatDateTimeBr(c.verifiedAt)}` : ""}
                  </div>
                </div>
              </div>
            );
          })}

          {missingKeyProviders.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  {p.name}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  Sem chave configurada · não é verificado
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {replaced.length > 0 && (
        <div className="mt-3 space-y-1">
          {replaced.map((m) => (
            <div
              key={`${m.provider}-${m.role}`}
              className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {providerLabel(m.provider)}: o modelo {modelLabel(m.provider, m.replacedModelId!)}{" "}
                saiu do ar e foi substituído automaticamente por {modelLabel(m.provider, m.modelId)}
                {m.updatedAt ? ` em ${formatDateTimeBr(m.updatedAt)}` : ""}.
              </span>
            </div>
          ))}
        </div>
      )}
    </DashboardPanelSurface>
  );
}

/* -------------------------------------------------------------------------- */

function ProviderCard({
  provider,
  config,
  brandId,
  onChanged,
  usage,
  use,
  usedForMemory,
  activeModels,
  onMakePrimary,
  isSaving,
}: {
  provider: ProviderDef;
  config?: ProviderConfig;
  brandId: string;
  onChanged: () => void;
  usage: { usd: number; tokens: number; calls: number };
  use: ProviderUse;
  usedForMemory: boolean;
  activeModels: ActiveModels;
  onMakePrimary?: () => void;
  isSaving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveFn = useServerFn(saveProviderKey);
  const removeFn = useServerFn(removeProviderKey);
  const testFn = useServerFn(testProviderKey);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { brandId, provider: provider.id, apiKey: apiKey.trim() } }),
    onSuccess: (res) => {
      if (res.verified === "valid") toast.success(`${provider.name} conectado — chave válida`);
      else toast.warning(aiErrorMessage(res.message, "Chave salva, mas não verificada"));
      setApiKey("");
      setSaveError(null);
      setOpen(false);
      onChanged();
    },
    onError: (e: unknown) => {
      const msg = aiErrorMessage(e, "Falha ao conectar");
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const testMut = useMutation({
    mutationFn: () => testFn({ data: { brandId, provider: provider.id } }),
    onSuccess: (res) => {
      const msg = aiErrorMessage(res.message, "Teste concluído");
      if (res.status === "valid") toast.success(msg);
      else if (res.status === "invalid") toast.error(msg);
      else toast.warning(msg);
      onChanged();
    },
    onError: (e: unknown) => toast.error(aiErrorMessage(e, "Falha ao testar a chave")),
  });

  const removeMut = useMutation({
    mutationFn: () => removeFn({ data: { brandId, provider: provider.id } }),
    onSuccess: () => {
      toast.success(`${provider.name} desconectado`);
      onChanged();
    },
    onError: (e: unknown) => toast.error(aiErrorMessage(e, "Falha ao desconectar")),
  });

  const connected = !!config?.connected;
  const Icon = provider.icon;

  return (
    <DashboardPanelSurface
      className={cn("flex flex-col p-3.5", use === "primary" && "ring-1 ring-primary/40")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/60",
              provider.tone,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{provider.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{provider.hint}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ProviderStatus connected={connected} verified={config?.verified} />
          <ProviderUseBadge use={use} />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {PROVIDER_USE_TEXT[use]}
        {usedForMemory ? " Também gera a memória da IA (busca no histórico)." : ""}
      </p>

      <div className="mt-3 space-y-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Modelos em uso
        </span>
        {(["strategic", "operational"] as const).map((role) => {
          const id = activeModels[role];
          if (!id) return null;
          return (
            <div key={role} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
              <span className="truncate font-medium">{modelLabel(provider.id, id)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
        {connected ? (
          <>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <KeyRound className="h-3 w-3" />
                API Key
              </span>
              <span className="tabular-nums text-foreground/80">{config?.masked ?? "••••"}</span>
            </div>
            <div
              className={cn(
                "mt-1 text-[11px]",
                config?.verified === "valid"
                  ? "text-health-good"
                  : config?.verified === "invalid"
                    ? "text-severity-critical"
                    : "text-severity-warning",
              )}
            >
              {keyStateLabel(config)}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            Obtenha a chave em {provider.docs}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Tokens este mês{" "}
          <span className="font-medium tabular-nums text-foreground/90">
            {usage.tokens.toLocaleString("pt-BR")}
          </span>
        </span>
        <span>
          Custo{" "}
          <span className="font-medium tabular-nums text-foreground/90">
            ${usage.usd.toFixed(2)}
          </span>
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {connected ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
            >
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", testMut.isPending && "animate-spin")} />
              Testar
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setOpen(true)}>
              Rotacionar chave
            </Button>
            {onMakePrimary && (
              <Button size="sm" variant="outline" className="flex-1" onClick={onMakePrimary} disabled={isSaving}>
                Tornar principal
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (
                  window.confirm(
                    `Remover a chave do ${provider.name}? A IA deixa de usar este provedor.`,
                  )
                )
                  removeMut.mutate();
              }}
              disabled={removeMut.isPending}
              aria-label={`Remover ${provider.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button size="sm" className="flex-1" onClick={() => setOpen(true)}>
            Conectar
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar {provider.name}</DialogTitle>
            <DialogDescription>
              A chave é testada antes de ser salva e fica armazenada de forma cifrada. Apenas os
              últimos 4 caracteres ficam visíveis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`key-${provider.id}`}>API Key</Label>
            <PasswordInput
              id={`key-${provider.id}`}
              autoComplete="off"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaveError(null);
              }}
            />
            {saveError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {saveError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || apiKey.trim().length < 8}
            >
              {saveMut.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {saveMut.isPending ? "Testando chave…" : "Testar e salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPanelSurface>
  );
}

const PROVIDER_USE_TEXT: Record<ProviderUse, string> = {
  primary: "Escreve todos os textos do workspace.",
  fallback: "Só escreve se a IA principal falhar.",
  standby: "Conectada, mas não escreve textos enquanto não for a principal.",
  none: "Sem chave. Não é usada.",
};

function ProviderUseBadge({ use }: { use: ProviderUse }) {
  if (use === "none") return null;
  const label = use === "primary" ? "Principal" : use === "fallback" ? "Reserva" : "Em espera";
  return (
    <Badge
      variant={use === "primary" ? "default" : "outline"}
      className={cn("shrink-0 text-[10px]", use !== "primary" && "text-muted-foreground")}
    >
      {label}
    </Badge>
  );
}

function ProviderStatus({
  connected,
  verified,
}: {
  connected: boolean;
  verified?: ProviderConfig["verified"];
}) {
  if (!connected) {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
        Não conectado
      </Badge>
    );
  }
  if (verified === "invalid") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-severity-critical/30 text-[10px] text-severity-critical"
      >
        Problema
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-health-good/30 text-[10px] text-health-good"
    >
      Conectado
    </Badge>
  );
}
