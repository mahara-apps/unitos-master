import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Link2, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CHANNEL_FORMATS,
  channelDef,
  normalizeStatus,
  StatusDot,
} from "@/components/connections/channel-meta";
import {
  listClientLinkedChannelsFn,
  listWorkspaceChannelsFn,
  toggleClientChannelFn,
  type LinkedChannel,
  type WorkspaceChannel,
} from "@/lib/client-channels.functions";

/**
 * Perfil do cliente > Canais.
 *
 * Mostra EXCLUSIVAMENTE os canais vinculados a este cliente
 * (`client_social_accounts`). Nunca lista canais de outros clientes nem
 * inicia OAuth — a conexão de contas acontece em /connections (workspace).
 */
export function ChannelsTab({
  brandId,
  clientId,
  canManage = true,
}: {
  brandId: string;
  clientId: string;
  /** owner/manager/super_admin podem vincular e desvincular. */
  canManage?: boolean;
}) {
  const qc = useQueryClient();
  const listLinkedFn = useServerFn(listClientLinkedChannelsFn);
  const [pickerOpen, setPickerOpen] = useState(false);

  const linkedKey = ["client-linked-channels", brandId, clientId] as const;
  const linkedQ = useQuery({
    queryKey: linkedKey,
    queryFn: () => listLinkedFn({ data: { brandId, clientId } }),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: linkedKey });
    qc.invalidateQueries({ queryKey: ["workspace-channels", brandId] });
    qc.invalidateQueries({ queryKey: ["client-channels", brandId, clientId] });
    qc.invalidateQueries({ queryKey: ["wizard-connections", brandId, clientId] });
    qc.invalidateQueries({ queryKey: ["social-analytics", brandId, clientId] });
  };

  const rows = linkedQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Canais vinculados</h3>
          <p className="text-xs text-muted-foreground">
            Contas que este cliente pode usar para publicar.
          </p>
        </div>
        {canManage && rows.length > 0 ? (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Vincular canal
          </Button>
        ) : null}
      </div>

      {linkedQ.isLoading ? (
        <div className="grid gap-2.5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[112px] w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-start gap-2 border-dashed p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Nenhum canal vinculado
          </div>
          <p className="text-xs text-muted-foreground">
            Este cliente ainda não possui canais sociais vinculados.
          </p>
          {canManage ? (
            <Button size="sm" className="mt-1 h-8 gap-1.5 text-xs" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Vincular canal
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Solicite a um administrador o vínculo de um canal.
            </p>
          )}
        </Card>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {rows.map((row) => (
            <LinkedChannelCard
              key={row.connectionId}
              row={row}
              brandId={brandId}
              clientId={clientId}
              canManage={canManage}
              onChanged={invalidate}
            />
          ))}
        </div>
      )}

      <LinkChannelDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        brandId={brandId}
        clientId={clientId}
        onChanged={invalidate}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function LinkedChannelCard({
  row,
  brandId,
  clientId,
  canManage,
  onChanged,
}: {
  row: LinkedChannel;
  brandId: string;
  clientId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toggleFn = useServerFn(toggleClientChannelFn);
  const def = channelDef(row.channel);
  const Icon = def.icon;
  const status = normalizeStatus(row.status);
  const formats = CHANNEL_FORMATS[row.channel] ?? [];

  const unlinkMut = useMutation({
    mutationFn: () =>
      toggleFn({
        data: { brandId, clientId, connectionId: row.connectionId, assigned: false },
      }),
    onSuccess: () => {
      toast.success("Vínculo removido");
      onChanged();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao remover vínculo"),
  });

  return (
    <Card className="flex flex-col gap-2.5 p-3.5">
      <div className="flex items-start gap-2.5">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
          <AvatarFallback className="text-[10px] uppercase">
            {row.channel.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${def.tone}`} />
            <span className="truncate text-sm font-medium">{def.label}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {row.handle ? `@${row.handle.replace(/^@/, "")}` : row.accountLabel}
          </p>
        </div>
        <StatusDot
          status={status}
          label={status === "active" ? "Ativo" : undefined}
          className="shrink-0"
        />
      </div>

      {formats.length ? (
        <div className="flex flex-wrap gap-1">
          {formats.map((f) => (
            <Badge key={f} variant="secondary" className="text-[10px] font-normal">
              {f}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t pt-2.5">
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs">
          <Link to="/connections">
            <Settings2 className="h-3.5 w-3.5" />
            Gerenciar
          </Link>
        </Button>
        {canManage ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
            disabled={unlinkMut.isPending}
            onClick={() => unlinkMut.mutate()}
          >
            {unlinkMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Desvincular
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function LinkChannelDialog({
  open,
  onOpenChange,
  brandId,
  clientId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  clientId: string;
  onChanged: () => void;
}) {
  const listFn = useServerFn(listWorkspaceChannelsFn);
  const toggleFn = useServerFn(toggleClientChannelFn);

  const { data = [], isLoading } = useQuery({
    queryKey: ["workspace-channels", brandId],
    queryFn: () => listFn({ data: { brandId } }),
    enabled: open,
    staleTime: 30_000,
  });

  const linkMut = useMutation({
    mutationFn: (connectionId: string) =>
      toggleFn({ data: { brandId, clientId, connectionId, assigned: true } }),
    onSuccess: () => {
      toast.success("Canal vinculado");
      onOpenChange(false);
      onChanged();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao vincular canal"),
  });

  const candidates = data.filter(
    (c) => normalizeStatus(c.status) !== "disconnected",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Selecionar canal</DialogTitle>
          <DialogDescription className="text-xs">
            Somente contas já conectadas ao workspace. Para conectar uma nova
            conta, use a tela de Integrações.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="space-y-2 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Nenhuma conta conectada</p>
            <p className="text-xs text-muted-foreground">
              Conecte uma conta no workspace antes de vincular a este cliente.
            </p>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <Link to="/connections">Abrir Integrações</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <CandidateRow
                key={c.connectionId}
                row={c}
                clientId={clientId}
                pending={linkMut.isPending && linkMut.variables === c.connectionId}
                onSelect={() => linkMut.mutate(c.connectionId)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({
  row,
  clientId,
  pending,
  onSelect,
}: {
  row: WorkspaceChannel;
  clientId: string;
  pending: boolean;
  onSelect: () => void;
}) {
  const def = channelDef(row.channel);
  const Icon = def.icon;
  const alreadyHere = row.clients.some((c) => c.id === clientId);
  const otherClients = row.clients.filter((c) => c.id !== clientId);

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
        <AvatarFallback className="text-[10px] uppercase">
          {row.channel.slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${def.tone}`} />
          <span className="truncate text-sm font-medium">{def.label}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.handle ? `@${row.handle.replace(/^@/, "")}` : row.accountLabel}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
          <StatusDot status={normalizeStatus(row.status)} />
          {otherClients.length ? (
            <span className="text-[11px] text-muted-foreground">
              Vinculado a outro cliente
            </span>
          ) : null}
        </div>
      </div>
      {alreadyHere ? (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          Vinculado
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2.5 text-xs"
          disabled={pending}
          onClick={onSelect}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Selecionar"}
        </Button>
      )}
    </div>
  );
}
