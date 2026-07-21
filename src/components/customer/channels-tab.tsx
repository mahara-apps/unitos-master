import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Facebook,
  Instagram,
  Loader2,
  Plus,
  Radio,
  Music2,
  Youtube,
  Linkedin,
  Twitter,
  AtSign,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MetaPortfolioDialog } from "@/components/connections/meta-portfolio-dialog";
import { getActiveMetaSession, startMetaOAuth } from "@/lib/meta/meta.functions";
import {
  listClientChannelAssignmentsFn,
  toggleClientChannelFn,
  type ClientChannelRow,
} from "@/lib/client-channels.functions";

type ChannelKey =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "twitter"
  | "threads";

type ChannelDef = {
  key: ChannelKey;
  label: string;
  icon: LucideIcon;
  tone: string;
  /** true = OAuth já implementado (Meta). false = placeholder "em breve". */
  available: boolean;
  /** Fluxo de conexão do provider (só para available=true). */
  provider?: "meta";
};

const CHANNELS: ChannelDef[] = [
  { key: "instagram", label: "Instagram", icon: Instagram, tone: "text-pink-500", available: true, provider: "meta" },
  { key: "facebook", label: "Facebook", icon: Facebook, tone: "text-sky-600", available: true, provider: "meta" },
  { key: "tiktok", label: "TikTok", icon: Music2, tone: "text-foreground", available: false },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, tone: "text-sky-700", available: false },
  { key: "youtube", label: "YouTube", icon: Youtube, tone: "text-red-500", available: false },
  { key: "threads", label: "Threads", icon: AtSign, tone: "text-foreground", available: false },
  { key: "twitter", label: "X / Twitter", icon: Twitter, tone: "text-foreground", available: false },
];

const CHANNEL_META = new Map(CHANNELS.map((c) => [c.key, c]));
const AVAILABLE_CHANNELS = CHANNELS.filter((c) => c.available);
const UPCOMING_CHANNELS = CHANNELS.filter((c) => !c.available);

export function ChannelsTab({
  brandId,
  clientId,
}: {
  brandId: string;
  clientId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listClientChannelAssignmentsFn);
  const toggleFn = useServerFn(toggleClientChannelFn);
  const startMetaFn = useServerFn(startMetaOAuth);
  const getActiveMetaSessionFn = useServerFn(getActiveMetaSession);
  const [connecting, setConnecting] = useState<null | "facebook" | "instagram">(null);
  const [portfolioSessionId, setPortfolioSessionId] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioChannel, setPortfolioChannel] = useState<"facebook" | "instagram" | null>(null);

  const queryKey = ["client-channels", brandId, clientId] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { brandId, clientId } }),
    staleTime: 30_000,
  });

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as {
        source?: string;
        type?: string;
        ok?: boolean;
        error?: string;
        message?: string;
        sessionId?: string | null;
        channel?: "facebook" | "instagram" | null;
        scopes?: string[];
      };
      if (!d || d.source !== "meta-oauth") return;
      if (d.type === "missing-scopes" && d.scopes?.length) {
        toast.warning(`Permissões negadas: ${d.scopes.join(", ")}.`, { duration: 8000 });
        return;
      }
      setConnecting(null);
      if (d.ok && d.sessionId) {
        toast.success(d.message ?? "Meta conectada");
        setPortfolioSessionId(d.sessionId);
        setPortfolioChannel(d.channel ?? null);
        setPortfolioOpen(true);
      } else if (d.error) {
        toast.error(d.error);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connectMeta(channel: "facebook" | "instagram") {
    setConnecting(channel);
    try {
      const existing = await getActiveMetaSessionFn({ data: { brandId } });
      if (existing.sessionId) {
        setPortfolioSessionId(existing.sessionId);
        setPortfolioChannel(channel);
        setPortfolioOpen(true);
        setConnecting(null);
        return;
      }
    } catch {
      // Fall back to OAuth.
    }

    const popup = window.open("", "meta-oauth", "width=760,height=820,resizable=yes,scrollbars=yes");
    try {
      const { authorizeUrl } = await startMetaFn({ data: { brandId, channel } });
      if (popup) popup.location.href = authorizeUrl;
      else window.location.href = authorizeUrl;
    } catch (e) {
      setConnecting(null);
      popup?.close();
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar OAuth da Meta");
    }
  }

  const toggleMut = useMutation({
    mutationFn: (v: { connectionId: string; assigned: boolean }) =>
      toggleFn({ data: { brandId, clientId, ...v } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ClientChannelRow[]>(queryKey);
      qc.setQueryData<ClientChannelRow[]>(queryKey, (rows) =>
        (rows ?? []).map((r) =>
          r.connectionId === v.connectionId ? { ...r, assigned: v.assigned } : r,
        ),
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar vínculo");
    },
    onSuccess: (_r, v) => {
      toast.success(v.assigned ? "Canal vinculado" : "Vínculo removido");
      qc.invalidateQueries({ queryKey: ["wizard-connections", brandId, clientId] });
      qc.invalidateQueries({ queryKey: ["social-analytics", brandId, clientId] });
      qc.invalidateQueries({ queryKey: ["social-analytics-top", brandId, clientId] });
    },
  });

  const rows = q.data ?? [];
  const assignedCount = rows.filter((r) => r.assigned).length;

  const assignedRows = rows.filter((r) => r.assigned);
  const availableRows = rows.filter((r) => !r.assigned);
  const hasAnyAccount = rows.length > 0;

  function ChannelIcon({ channel }: { channel: string }) {
    const def = CHANNEL_META.get(channel as ChannelKey);
    if (!def) return null;
    const Icon = def.icon;
    return <Icon className={`h-3.5 w-3.5 ${def.tone}`} />;
  }

  function RowItem({ row }: { row: ClientChannelRow }) {
    const def = CHANNEL_META.get(row.channel as ChannelKey);
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
            <AvatarFallback className="text-[10px] uppercase">
              {row.channel.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{row.accountLabel}</div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <ChannelIcon channel={row.channel} />
              <span className="truncate">
                {def?.label ?? row.channel}
                {row.handle ? ` · @${row.handle}` : ""}
                {row.status !== "active" ? ` · ${row.status}` : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toggleMut.isPending && toggleMut.variables?.connectionId === row.connectionId ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <Switch
            checked={row.assigned}
            onCheckedChange={(v) =>
              toggleMut.mutate({ connectionId: row.connectionId, assigned: v })
            }
            aria-label={`Vincular ${row.accountLabel} a este cliente`}
          />
        </div>
      </li>
    );
  }

  const connectButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!!connecting}>
          {connecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Conectar Nova Conta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {AVAILABLE_CHANNELS.map((def) => {
          const Icon = def.icon;
          return (
            <DropdownMenuItem
              key={def.key}
              onSelect={() => connectMeta(def.key as "facebook" | "instagram")}
              className="gap-2"
            >
              <Icon className={`h-4 w-4 ${def.tone}`} />
              <span>{def.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-primary" />
            Canais deste cliente
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {assignedCount} {assignedCount === 1 ? "ativo" : "ativos"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ative uma conta com o toggle ou conecte uma nova. Vínculos aparecem no wizard do Calendário.
          </p>
        </div>
        {connectButton}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !hasAnyAccount ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-card px-6 py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
            <Radio className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="text-sm font-medium">Nenhuma conta social conectada</div>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Autorize uma conta da Meta (Instagram ou Facebook) para começar a agendar publicações para este cliente.
            </p>
          </div>
          {connectButton}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Canais Vinculados
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {assignedRows.length}
              </Badge>
            </div>
            {assignedRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhuma conta vinculada. Ative uma conta abaixo ou conecte uma nova.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {assignedRows.map((row) => (
                  <RowItem key={row.connectionId} row={row} />
                ))}
              </ul>
            )}
          </section>

          {availableRows.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Disponíveis no Workspace
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {availableRows.length}
                </Badge>
              </div>
              <ul className="divide-y divide-border/60">
                {availableRows.map((row) => (
                  <RowItem key={row.connectionId} row={row} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="pt-2">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Próximas Integrações
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {UPCOMING_CHANNELS.map((def) => {
            const Icon = def.icon;
            return (
              <div
                key={def.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground"
                title={`${def.label} — em breve`}
              >
                <Icon className="h-3.5 w-3.5 opacity-60" />
                <span>{def.label}</span>
                <span className="ml-1 rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide">
                  Em breve
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
        Precisa gerenciar Business Manager, contas de anúncio ou credenciais de API globais? Isso vive em{" "}
        <Link to="/connections" className="font-medium underline underline-offset-2">Integrações</Link> (acesso admin).
      </div>

      <MetaPortfolioDialog
        brandId={brandId}
        clientId={clientId}
        sessionId={portfolioSessionId}
        open={portfolioOpen}
        channel={portfolioChannel}
        onOpenChange={(open) => {
          setPortfolioOpen(open);
          if (!open) {
            qc.invalidateQueries({ queryKey });
            qc.invalidateQueries({ queryKey: ["wizard-connections", brandId, clientId] });
          }
        }}
      />
    </div>
  );
}