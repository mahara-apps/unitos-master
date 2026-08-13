import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Instagram, Facebook, Link2, Users } from "lucide-react";
import { listWorkspaceChannelsFn } from "@/lib/client-channels.functions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Contas sociais conectadas no NÍVEL DO WORKSPACE (social_connections).
 * A atribuição a clientes acontece em client_social_accounts e é exibida
 * aqui como badges — o vínculo é editado no perfil do cliente > Canais.
 */
export function WorkspaceChannelsPanel({ brandId }: { brandId: string | null }) {
  const listFn = useServerFn(listWorkspaceChannelsFn);
  const { data = [], isLoading } = useQuery({
    queryKey: ["workspace-channels", brandId],
    queryFn: () => listFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <Card className="flex items-center gap-3 border-dashed p-4 text-sm text-muted-foreground">
        <Link2 className="h-4 w-4 shrink-0" />
        Nenhuma conta conectada neste workspace. Conecte um canal abaixo e depois
        vincule aos clientes no perfil de cada cliente.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.map((c) => {
        const Icon = c.channel === "instagram" ? Instagram : Facebook;
        return (
          <Card key={c.connectionId} className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              {c.avatarUrl ? (
                <img
                  src={c.avatarUrl}
                  alt={c.accountLabel}
                  className="h-9 w-9 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.accountLabel}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.handle ? `@${c.handle.replace(/^@/, "")}` : c.channel}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 text-[10px] uppercase",
                  c.status === "active"
                    ? "border-emerald-500/40 text-emerald-600"
                    : "border-amber-500/40 text-amber-600",
                )}
              >
                {c.status === "active" ? "ativa" : c.status}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {c.clients.length ? (
                c.clients.map((cl) => (
                  <Badge key={cl.id} variant="secondary" className="text-[10px]">
                    {cl.name}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  Sem cliente vinculado
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
