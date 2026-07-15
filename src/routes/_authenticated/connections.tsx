import { createFileRoute } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Brain,
  Cpu,
  KeyRound,
  DollarSign,
  Radio,
  CheckCircle2,
  Mail,
  Instagram,
  Facebook,
  Youtube,
  Music2,
  MessageCircle,
  Send,
  Linkedin,
  Twitter,
  AtSign,
  Trash2,
  Activity,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  getConnections,
  updateConnectionsSettings,
  saveProviderKey,
  removeProviderKey,
  upsertChannel,
} from "@/lib/connections.functions";
import { usePageHeader } from "@/hooks/use-page-header";
import {
  DashboardPageShell,
  DashboardPanelSurface,
} from "@/components/ui/dashboard-primitives";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/connections")({
  component: ConnectionsPage,
});

function ConnectionsHeaderRegister() {
  usePageHeader({
    title: "Conexões",
    subtitle:
      "Chaves de IA, canais sociais e comunicações do workspace · cifradas com AES-256-GCM",
  });
  return null;
}

type ProviderId = "openai" | "anthropic" | "gemini";
type ChannelId =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "whatsapp_evolution"
  | "whatsapp_cloud"
  | "resend";

type ProviderDef = {
  id: ProviderId;
  name: string;
  hint: string;
  tone: string;
  docs: string;
  icon: ComponentType<{ className?: string }>;
  models: Array<{ id: string; label: string; kind: "text" | "image" }>;
};

const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    hint: "GPT-5, o1, GPT-Image",
    tone: "text-emerald-500",
    docs: "platform.openai.com",
    icon: Sparkles,
    models: [
      { id: "gpt-5", label: "GPT-5", kind: "text" },
      { id: "gpt-5-mini", label: "GPT-5 mini", kind: "text" },
      { id: "gpt-image-1", label: "GPT Image 1", kind: "image" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    hint: "Claude Sonnet & Opus",
    tone: "text-amber-500",
    docs: "console.anthropic.com",
    icon: Brain,
    models: [
      { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", kind: "text" },
      { id: "claude-opus-4.1", label: "Claude Opus 4.1", kind: "text" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    hint: "Gemini 2.5 · Imagen 4",
    tone: "text-sky-500",
    docs: "aistudio.google.com",
    icon: Cpu,
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", kind: "text" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", kind: "text" },
      { id: "imagen-4", label: "Imagen 4", kind: "image" },
    ],
  },
];

type ChannelDef = {
  id: ChannelId;
  name: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  handleLabel: string;
  handlePlaceholder: string;
};

const SOCIAL_CHANNELS: ChannelDef[] = [
  {
    id: "instagram",
    name: "Instagram",
    hint: "Feed, Reels & Stories",
    icon: Instagram,
    tone: "text-pink-500",
    handleLabel: "Handle",
    handlePlaceholder: "@marca",
  },
  {
    id: "tiktok",
    name: "TikTok",
    hint: "Business API",
    icon: Music2,
    tone: "text-foreground",
    handleLabel: "Handle",
    handlePlaceholder: "@marca",
  },
  {
    id: "facebook",
    name: "Facebook",
    hint: "Páginas & Ads",
    icon: Facebook,
    tone: "text-sky-600",
    handleLabel: "Página",
    handlePlaceholder: "facebook.com/marca",
  },
  {
    id: "youtube",
    name: "YouTube",
    hint: "Shorts & vídeos longos",
    icon: Youtube,
    tone: "text-red-500",
    handleLabel: "Canal",
    handlePlaceholder: "@marca",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    hint: "Company Pages & posts",
    icon: Linkedin,
    tone: "text-sky-700",
    handleLabel: "Página",
    handlePlaceholder: "linkedin.com/company/marca",
  },
  {
    id: "twitter",
    name: "Twitter / X",
    hint: "Posts & threads",
    icon: Twitter,
    tone: "text-foreground",
    handleLabel: "Handle",
    handlePlaceholder: "@marca",
  },
  {
    id: "threads",
    name: "Threads",
    hint: "Meta Threads",
    icon: AtSign,
    tone: "text-foreground",
    handleLabel: "Handle",
    handlePlaceholder: "@marca",
  },
];

const MESSAGING_CHANNELS: ChannelDef[] = [
  {
    id: "whatsapp_evolution",
    name: "WhatsApp Evolution",
    hint: "Instância self-hosted",
    icon: MessageCircle,
    tone: "text-emerald-500",
    handleLabel: "Instância / URL",
    handlePlaceholder: "https://evo.dominio.com · marca",
  },
  {
    id: "whatsapp_cloud",
    name: "WhatsApp Cloud API",
    hint: "Meta Business Cloud",
    icon: Send,
    tone: "text-emerald-600",
    handleLabel: "Phone Number ID",
    handlePlaceholder: "123456789012345",
  },
  {
    id: "resend",
    name: "Resend",
    hint: "E-mails transacionais",
    icon: Mail,
    tone: "text-violet-500",
    handleLabel: "From address",
    handlePlaceholder: "hello@dominio.com",
  },
];

function ConnectionsPage() {
  const { brandId } = useActiveContext();
  const qc = useQueryClient();

  const getFn = useServerFn(getConnections);
  const { data, isLoading } = useQuery({
    queryKey: ["connections", brandId],
    queryFn: () => getFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["connections", brandId] });

  type UpdateInput = {
    brandId: string;
    monthlyBudgetUsd?: number;
    textProvider?: ProviderId;
    imageProvider?: ProviderId;
  };
  const updateFn = useServerFn(updateConnectionsSettings);
  const updateMut = useMutation({
    mutationFn: (input: UpdateInput) => updateFn({ data: input }),
    onSuccess: () => {
      invalidate();
      toast.success("Configurações atualizadas");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  if (!brandId) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Selecione um workspace para ver as conexões.
      </div>
    );
  }

  const active = data?.monthlyBudgetUsd ?? 500;
  const used = data?.usage.monthUsd ?? 0;
  const pct = Math.min(100, Math.round((used / (active || 1)) * 100));
  const totalCalls = data?.usage.totalCalls ?? 0;
  const successCalls = data?.usage.successCalls ?? 0;
  const successRate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;

  return (
    <DashboardPageShell>
      <ConnectionsHeaderRegister />

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList variant="bordered">
          <TabsTrigger value="ai">
            <Sparkles className="h-3.5 w-3.5" />
            IA
          </TabsTrigger>
          <TabsTrigger value="channels">
            <Radio className="h-3.5 w-3.5" />
            Canais
          </TabsTrigger>
          <TabsTrigger value="messaging">
            <Send className="h-3.5 w-3.5" />
            Mensageria
          </TabsTrigger>
        </TabsList>

        {/* Tab: IA */}
        <TabsContent value="ai" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Consumo do mês"
            value={isLoading ? "—" : `$${used.toFixed(2)}`}
            sub={`de $${active.toFixed(0)} · ${pct}%`}
            tone={pct >= 80 ? "amber" : "emerald"}
          />
          <KpiCard
            icon={<Coins className="h-4 w-4" />}
            label="Tokens do mês"
            value={(data?.usage.monthTokens ?? 0).toLocaleString("pt-BR")}
            sub="Entrada + saída somados"
            tone="violet"
          />
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            label="Chamadas de IA"
            value={totalCalls.toLocaleString("pt-BR")}
            sub={`${successCalls} com sucesso`}
            tone="sky"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Taxa de sucesso"
            value={`${successRate}%`}
            sub={pct >= 80 ? "Teto próximo do limite" : "Operando dentro do teto"}
            tone={successRate >= 95 ? "emerald" : successRate >= 80 ? "amber" : "rose"}
          />
        </div>

        <SectionHeader
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="inteligências artificiais"
          hint="Provedores, modelos ativos e consumo"
        />

        <DashboardPanelSurface className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <LeaderPicker
              label="Modelo de texto ativo"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              value={data?.textProvider ?? "openai"}
              onChange={(v) => updateMut.mutate({ brandId, textProvider: v })}
            />
            <LeaderPicker
              label="Modelo de imagem ativo"
              icon={<Brain className="h-3.5 w-3.5" />}
              value={data?.imageProvider ?? "gemini"}
              onChange={(v) => updateMut.mutate({ brandId, imageProvider: v })}
            />
            <BudgetInput
              active={active}
              onSave={(v) => updateMut.mutate({ brandId, monthlyBudgetUsd: v })}
            />
          </div>
        </DashboardPanelSurface>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              config={data?.providers?.[p.id]}
              brandId={brandId}
              onChanged={invalidate}
              totalMonthUsd={used}
              totalMonthTokens={data?.usage.monthTokens ?? 0}
              totalCalls={totalCalls}
            />
          ))}
        </div>
        </TabsContent>

        {/* Tab: Canais */}
        <TabsContent value="channels" className="space-y-3">
        <SectionHeader
          icon={<Radio className="h-3.5 w-3.5" />}
          title="canais sociais"
          hint="Instagram · TikTok · Facebook · YouTube · LinkedIn · X · Threads"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SOCIAL_CHANNELS.map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              config={data?.channels?.[c.id]}
              brandId={brandId}
              onChanged={invalidate}
            />
          ))}
        </div>
        </TabsContent>

        {/* Tab: Mensageria */}
        <TabsContent value="messaging" className="space-y-3">
        <SectionHeader
          icon={<Send className="h-3.5 w-3.5" />}
          title="mensageria & entrega"
          hint="WhatsApp Evolution · WhatsApp Cloud · Resend"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {MESSAGING_CHANNELS.map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              config={data?.channels?.[c.id]}
              brandId={brandId}
              onChanged={invalidate}
            />
          ))}
        </div>
        </TabsContent>
      </Tabs>
    </DashboardPageShell>
  );
}

/* -------------------------------------------------------------------------- */

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex items-end justify-between border-b border-border/60 pb-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-widest">{title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function BudgetInput({
  active,
  onSave,
}: {
  active: number;
  onSave: (v: number) => void;
}) {
  const [budget, setBudget] = useState<string>("");
  const value = budget === "" ? String(active) : budget;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <DollarSign className="h-3.5 w-3.5" />
        Teto mensal (USD)
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setBudget(e.target.value)}
          className="h-9 w-[110px] font-mono tabular-nums"
        />
        <Button
          size="sm"
          onClick={() => {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0) return;
            onSave(n);
            setBudget("");
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

function LeaderPicker({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: ProviderId;
  onChange: (v: ProviderId) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        {icon}
        {label}
      </div>
      <Select value={value} onValueChange={(v) => onChange(v as ProviderId)}>
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROVIDERS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProviderCard({
  provider,
  config,
  brandId,
  onChanged,
  totalMonthUsd,
  totalMonthTokens,
  totalCalls,
}: {
  provider: ProviderDef;
  config?: { connected: boolean; masked?: string; updatedAt?: string };
  brandId: string;
  onChanged: () => void;
  totalMonthUsd: number;
  totalMonthTokens: number;
  totalCalls: number;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<string>(provider.models[0]?.id ?? "");

  const saveFn = useServerFn(saveProviderKey);
  const removeFn = useServerFn(removeProviderKey);

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({ data: { brandId, provider: provider.id, apiKey: apiKey.trim() } }),
    onSuccess: () => {
      toast.success(`${provider.name} conectado`);
      setApiKey("");
      setOpen(false);
      onChanged();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao conectar"),
  });

  const removeMut = useMutation({
    mutationFn: () => removeFn({ data: { brandId, provider: provider.id } }),
    onSuccess: () => {
      toast.success(`${provider.name} desconectado`);
      onChanged();
    },
  });

  const connected = !!config?.connected;
  const Icon = provider.icon;
  // TODO: persist per-provider model + expose usage breakdown by provider
  // from the server. Until then the card mirrors aggregate telemetry.
  const share = connected && totalCalls > 0 ? 1 / PROVIDERS.filter(() => true).length : 0;
  const estCostUsd = connected ? totalMonthUsd * share : 0;
  const estTokens = connected ? Math.round(totalMonthTokens * share) : 0;

  return (
    <DashboardPanelSurface className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-lg border border-border/60 bg-background/60",
              provider.tone,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold">{provider.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{provider.hint}</div>
          </div>
        </div>
        <StatusBadge connected={connected} />
      </div>

      <div className="mt-4 space-y-2">
        <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Modelo padrão
        </Label>
        <Select value={model} onValueChange={setModel} disabled={!connected}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecionar modelo" />
          </SelectTrigger>
          <SelectContent>
            {provider.models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
                <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">
                  {m.kind}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 rounded-lg border border-border/60 bg-background/60 p-3">
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <KeyRound className="h-3 w-3" />
            API Key
          </span>
          <span className="tabular-nums text-foreground/80">{config?.masked ?? "—"}</span>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">Obtenha em {provider.docs}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MicroStat
          label="Tokens (mês)"
          value={estTokens.toLocaleString("pt-BR")}
          hint={connected ? "estimativa" : "sem conexão"}
        />
        <MicroStat
          label="Custo estimado"
          value={`$${estCostUsd.toFixed(2)}`}
          hint={connected ? "rateio ativo" : "—"}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant={connected ? "outline" : "default"}
          className="flex-1"
          onClick={() => setOpen(true)}
        >
          {connected ? "Rotacionar chave" : "Conectar"}
        </Button>
        {connected && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => removeMut.mutate()}
            disabled={removeMut.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar {provider.name}</DialogTitle>
            <DialogDescription>
              A chave será cifrada com AES-256-GCM. Apenas os últimos 4 caracteres ficam visíveis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`key-${provider.id}`}>API Key</Label>
            <Input
              id={`key-${provider.id}`}
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || apiKey.trim().length < 8}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Salvar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPanelSurface>
  );
}

function ChannelCard({
  channel,
  config,
  brandId,
  onChanged,
}: {
  channel: ChannelDef;
  config?: { connected: boolean; handle?: string; updatedAt?: string };
  brandId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState(config?.handle ?? "");
  const Icon = channel.icon;

  const fn = useServerFn(upsertChannel);
  const saveMut = useMutation({
    mutationFn: () =>
      fn({ data: { brandId, channel: channel.id, handle: handle.trim(), connected: true } }),
    onSuccess: () => {
      toast.success(`${channel.name} conectado`);
      setOpen(false);
      onChanged();
    },
  });
  const removeMut = useMutation({
    mutationFn: () => fn({ data: { brandId, channel: channel.id, connected: false } }),
    onSuccess: () => {
      toast.success(`${channel.name} desconectado`);
      onChanged();
    },
  });

  const connected = !!config?.connected;

  return (
    <DashboardPanelSurface className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-lg border border-border/60 bg-background/60",
              channel.tone,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold">{channel.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{channel.hint}</div>
          </div>
        </div>
        <StatusBadge connected={connected} label={connected ? config?.handle : undefined} />
      </div>

      <Separator className="my-4" />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={connected ? "outline" : "default"}
          className="flex-1"
          onClick={() => setOpen(true)}
        >
          {connected ? "Editar" : "Conectar"}
        </Button>
        {connected && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => removeMut.mutate()}
            disabled={removeMut.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar {channel.name}</DialogTitle>
            <DialogDescription>
              Informe o identificador da conta para exibir na página de conexões.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`handle-${channel.id}`}>{channel.handleLabel}</Label>
            <Input
              id={`handle-${channel.id}`}
              placeholder={channel.handlePlaceholder}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || handle.trim().length === 0}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPanelSurface>
  );
}

function StatusBadge({ connected, label }: { connected: boolean; label?: string }) {
  if (connected) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        {label ?? "Conectado"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
      Não configurado
    </Badge>
  );
}

function MicroStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
          {hint}
        </div>
      ) : null}
    </div>
  );
}