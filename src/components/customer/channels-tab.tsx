import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Radio } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listClientChannelAssignmentsFn,
  toggleClientChannelFn,
  type ClientChannelRow,
} from "@/lib/client-channels.functions";

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

  const queryKey = ["client-channels", brandId, clientId] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { brandId, clientId } }),
    staleTime: 30_000,
  });

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
    },
  });

  const rows = q.data ?? [];
  const assignedCount = rows.filter((r) => r.assigned).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-primary" />
            Redes sociais atribuídas a este cliente
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Contas conectadas globalmente em <span className="font-medium">Conexões</span>.
            Ative o toggle para liberar a conta neste cliente — o Calendário passa a
            listá-la automaticamente no wizard de agendamento.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {assignedCount}/{rows.length} ativas
        </Badge>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-medium">Nenhuma conta social conectada ao workspace.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte contas em Conexões para poder atribuí-las aos clientes.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/connections">Ir para Conexões</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
          {rows.map((row) => (
            <li
              key={row.connectionId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={row.avatarUrl ?? undefined} alt={row.accountLabel} />
                  <AvatarFallback className="text-[10px] uppercase">
                    {row.channel.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.accountLabel}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {row.channel}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.handle ? `@${row.handle}` : row.provider}
                    {row.status !== "active" ? ` · ${row.status}` : ""}
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
          ))}
        </ul>
      )}
    </div>
  );
}