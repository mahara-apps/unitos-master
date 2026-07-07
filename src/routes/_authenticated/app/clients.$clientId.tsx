import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/app/clients/$clientId")({
  component: ClientLayout,
});

const TABS = [
  { to: "/app/clients/$clientId", label: "Overview", exact: true },
  { to: "/app/clients/$clientId/briefing", label: "Briefing" },
  { to: "/app/clients/$clientId/voice", label: "Voice" },
  { to: "/app/clients/$clientId/personas", label: "Personas" },
  { to: "/app/clients/$clientId/cohorts", label: "Cohorts" },
  { to: "/app/clients/$clientId/swot", label: "SWOT" },
  { to: "/app/clients/$clientId/pautas", label: "Pauta" },
  { to: "/app/clients/$clientId/content", label: "Copy" },
  { to: "/app/clients/$clientId/competitors", label: "Concorrentes" },
] as const;

function ClientLayout() {
  const { clientId } = Route.useParams();
  const { brandId, setClientId } = useActiveContext();
  const list = useServerFn(listClients);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  useEffect(() => {
    if (clientId) setClientId(clientId);
  }, [clientId, setClientId]);

  if (!brandId) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Selecione uma marca no menu lateral.
        </div>
      </div>
    );
  }

  const client = (clientsQ.data ?? []).find((c) => c.id === clientId);

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-zinc-950">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: client?.color ?? "#6366f1" }}
            >
              {(client?.name ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                client · agents
              </div>
              <h1 className="mt-0.5 text-2xl font-semibold">
                {client?.name ?? (clientsQ.isLoading ? "carregando…" : "cliente não encontrado")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {client?.niche ?? "—"} · <span className="font-mono">{clientId.slice(0, 8)}</span>
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
            escopo por cliente
          </Badge>
        </header>

        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-neutral-900/60 p-1">
          {TABS.map((t) => {
            const href = t.to.replace("$clientId", clientId);
            const active = t.exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={t.to}
                to={t.to}
                params={{ clientId }}
                className={
                  "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition duration-200 " +
                  (active
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div>
          {client === undefined && !clientsQ.isLoading ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
              Este cliente não pertence à marca ativa ou não existe.
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </ScrollArea>
  );
}