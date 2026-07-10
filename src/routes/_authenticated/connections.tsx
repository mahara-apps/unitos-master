import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  Plug,
  Mail,
  Instagram,
  Linkedin,
  Music2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useActiveContext } from "@/hooks/use-active-context";
import {
  getConnections,
  updateConnectionsSettings,
  saveProviderKey,
  removeProviderKey,
  upsertChannel,
  type ConnectionsSettings,
} from "@/lib/connections.functions";

export const Route = createFileRoute("/_authenticated/connections")({
  component: ConnectionsPage,
});

type ProviderId = "openai" | "anthropic" | "gemini";
type ChannelId = "meta" | "linkedin" | "tiktok" | "resend";

const PROVIDERS: Array<{
  id: ProviderId;
  name: string;
  hint: string;
  gradient: string;
  docs: string;
}> = [
  { id: "openai", name: "OpenAI", hint: "GPT-4o, o1, GPT-Image", gradient: "from-emerald-500/30 to-teal-500/10", docs: "platform.openai.com" },
  { id: "anthropic", name: "Anthropic", hint: "Claude Sonnet, Opus", gradient: "from-orange-500/30 to-amber-500/10", docs: "console.anthropic.com" },
  { id: "gemini", name: "Google Gemini", hint: "Gemini 2.5 Pro/Flash, Imagen", gradient: "from-sky-500/30 to-violet-500/10", docs: "aistudio.google.com" },
];

const CHANNELS: Array<{
  id: ChannelId;
  name: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  handleLabel: string;
  handlePlaceholder: string;
}> = [
  { id: "meta", name: "Meta (Instagram / Facebook)", hint: "Publicação e insights", icon: Instagram, handleLabel: "Handle Instagram", handlePlaceholder: "@pitadadigital" },
  { id: "linkedin", name: "LinkedIn", hint: "Company Page & posts", icon: Linkedin, handleLabel: "Empresa / Página", handlePlaceholder: "linkedin.com/company/..." },
  { id: "tiktok", name: "TikTok", hint: "Business API", icon: Music2, handleLabel: "Handle TikTok", handlePlaceholder: "@pitadadigital" },
  { id: "resend", name: "Resend", hint: "E-mails transacionais", icon: Mail, handleLabel: "From address", handlePlaceholder: "hello@dominio.com" },
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

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)]">
      <div className="w-full space-y-8 p-6 lg:p-8">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              module · connections
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Conexões</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Um único lugar para governar todas as chaves de IA, canais sociais e comunicações do workspace.
              Chaves são armazenadas cifradas (AES-256-GCM).
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            SYSTEM · OPERATIONAL
          </Badge>
        </header>

        {/* Telemetry topbar */}
        <UsageBar
          data={data}
          onSaveBudget={(v) =>
            updateMut.mutate({ brandId, monthlyBudgetUsd: v })
          }
          loading={isLoading}
        />

        {/* AI Foundations */}
        <section className="space-y-3">
          <SectionHeader
            icon={<Sparkles className="h-3.5 w-3.5" />}
            title="ai foundations"
            hint="Provedores de modelo com fallback round-robin"
          />

          {/* Active leaders */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card/50 p-4 md:grid-cols-2">
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
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {PROVIDERS.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                config={data?.providers?.[p.id]}
                brandId={brandId}
                onChanged={invalidate}
              />
            ))}
          </div>
        </section>

        {/* Channels */}
        <section className="space-y-3">
          <SectionHeader
            icon={<Radio className="h-3.5 w-3.5" />}
            title="channels & communications"
            hint="Redes sociais e e-mails transacionais"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {CHANNELS.map((c) => (
              <ChannelCard
                key={c.id}
                channel={c}
                config={data?.channels?.[c.id]}
                brandId={brandId}
                onChanged={invalidate}
              />
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
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
    <div className="flex items-end justify-between border-b pb-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-widest">{title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function UsageBar({
  data,
  onSaveBudget,
  loading,
}: {
  data?: ConnectionsSettings;
  onSaveBudget: (v: number) => void;
  loading: boolean;
}) {
  const [budget, setBudget] = useState<string>("");
  const active = data?.monthlyBudgetUsd ?? 500;
  const used = data?.usage.monthUsd ?? 0;
  const pct = Math.min(100, Math.round((used / (active || 1)) * 100));
  const warn = pct >= 80;

  const value = budget === "" ? String(active) : budget;

  return (
    <section className="rounded-2xl border bg-gradient-to-br from-card to-card/40 p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr,1fr]">
        {/* Spend */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            consumo · mês atual
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tabular-nums">
              ${loading ? "—" : used.toFixed(2)}
            </span>
            <span className="text-sm text-muted-foreground">/ ${active.toFixed(0)}</span>
          </div>

          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="uppercase tracking-widest text-muted-foreground">
                progresso do teto mensal
              </span>
              <span className={warn ? "text-amber-500" : "text-emerald-500"}>{pct}%</span>
            </div>
            <Progress
              value={pct}
              className={`h-2 ${warn ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <MicroStat label="Chamadas" value={data?.usage.totalCalls ?? 0} />
            <MicroStat label="Sucesso" value={data?.usage.successCalls ?? 0} />
            <MicroStat
              label="Tokens"
              value={(data?.usage.monthTokens ?? 0).toLocaleString("pt-BR")}
            />
          </div>
        </div>

        {/* Budget input */}
        <div className="flex flex-col justify-between rounded-xl border bg-background/50 p-4">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="font-mono text-[10px] uppercase tracking-widest">
                teto mensal (USD)
              </span>
            </div>
            <Label className="mt-3 block text-xs">Limite de gasto</Label>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-lg text-muted-foreground">$</span>
              <Input
                type="number"
                min={0}
                value={value}
                onChange={(e) => setBudget(e.target.value)}
                className="h-11 font-mono text-lg tabular-nums"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Alertas em 80% e corte automático em 100% do teto.
            </p>
          </div>
          <Button
            className="mt-4 bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-white dark:text-black dark:hover:bg-white/90"
            onClick={() => {
              const n = Number(value);
              if (!Number.isFinite(n) || n < 0) return;
              onSaveBudget(n);
              setBudget("");
            }}
          >
            Salvar teto
          </Button>
        </div>
      </div>
    </section>
  );
}

function MicroStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/50 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</div>
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
        <SelectTrigger className="h-9 w-[180px]">
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
}: {
  provider: (typeof PROVIDERS)[number];
  config?: { connected: boolean; masked?: string; updatedAt?: string };
  brandId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");

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

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${provider.gradient} opacity-40 blur-2xl`}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{provider.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{provider.hint}</div>
            </div>
          </div>
          {connected ? (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Conectado
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
              Não configurado
            </Badge>
          )}
        </div>

        <div className="mt-4 rounded-lg border bg-background/60 p-3">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <KeyRound className="h-3 w-3" />
              API Key
            </span>
            <span className="tabular-nums text-foreground/80">
              {config?.masked ?? "—"}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Obtenha em {provider.docs}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant={connected ? "outline" : "default"}
            className={`flex-1 ${
              connected
                ? ""
                : "bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-white dark:text-black dark:hover:bg-white/90"
            }`}
            onClick={() => setOpen(true)}
          >
            {connected ? "Rotacionar" : "Conectar"}
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
              className="bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Salvar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChannelCard({
  channel,
  config,
  brandId,
  onChanged,
}: {
  channel: (typeof CHANNELS)[number];
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
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">{channel.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{channel.hint}</div>
          </div>
        </div>
        {connected ? (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {config?.handle || "Conectado"}
          </Badge>
        ) : (
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            Não configurado
          </Badge>
        )}
      </div>

      <Separator className="my-4" />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={connected ? "outline" : "default"}
          className={`flex-1 ${
            connected
              ? ""
              : "bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-white dark:text-black dark:hover:bg-white/90"
          }`}
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
              className="bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Ensure Plug icon import is used (visual reference for future header slot).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keepPlug = Plug;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keepMemo = useMemo;