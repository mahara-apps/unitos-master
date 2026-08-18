import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listMyPortalClientsFn, resolvePortalSessionFn } from "@/lib/portal-session.functions";
import { FullScreenLoader, PortalIdentityProvider, TokenError } from "@/components/portal/portal-shared";
import { PortalModeProvider, PortalLink, usePortalPath } from "@/components/portal/portal-context";
import { PORTAL_TABS, type PortalTabId } from "@/components/portal/portal-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

/**
 * Shell do portal autenticado — experiência principal do cliente.
 *
 * Usa exatamente as mesmas abas do modo token: a diferença fica isolada em
 * `PortalModeProvider`, que decide quais server functions serão chamadas.
 */
export const Route = createFileRoute("/_portal/area")({
  component: PortalAreaLayout,
});

const STORAGE_KEY = "portal.session.clientId";

function PortalAreaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const resolve = useServerFn(resolvePortalSessionFn);
  const listClients = useServerFn(listMyPortalClientsFn);

  const [clientId, setClientId] = useState<string | null>(null);
  useEffect(() => {
    setClientId(localStorage.getItem(STORAGE_KEY));
  }, []);
  const pickClient = (id: string) => {
    setClientId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const linksQ = useQuery({ queryKey: ["portal", "my-clients"], queryFn: () => listClients(), staleTime: 5 * 60_000 });
  const sessionQ = useQuery({
    queryKey: ["portal", "session", clientId ?? "default"],
    queryFn: () => resolve({ data: clientId ? { clientId } : {} }),
    retry: false,
    staleTime: 60_000,
  });

  const identity = useMemo(() => ({ value: "", save: () => {} }), []);

  if (sessionQ.isLoading) return <FullScreenLoader />;
  if (sessionQ.error || !sessionQ.data?.client)
    return <TokenError message={sessionQ.data?.error ?? (sessionQ.error as Error)?.message} />;

  const client = sessionQ.data.client;
  const brand = sessionQ.data.brand;
  const theme = sessionQ.data.theme;
  const accent = theme?.accent || client.color || "#6366F1";
  const links = linksQ.data ?? [];
  const activeTab: PortalTabId =
    PORTAL_TABS.find((t) => pathname.endsWith(SESSION_SUFFIX[t.id]))?.id ?? "home";
  const initials = (client.name || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <PortalModeProvider value={{ kind: "session", clientId: sessionQ.data.clientId }}>
      <PortalIdentityProvider value={identity}>
        <div
          className={`min-h-screen bg-background text-foreground ${theme?.dark ? "dark" : ""}`}
          style={{ ["--portal-accent" as string]: accent }}
        >
          <div className="flex min-h-screen">
            <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card lg:flex">
              <div className="flex items-center gap-3 border-b border-border/60 px-5 py-5">
                {theme?.logoUrl ? (
                  <img src={theme.logoUrl} alt={client.name ?? "Logo"} className="h-10 w-10 rounded-xl object-contain" />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
                  >
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold tracking-tight">{client.name}</div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Portal do cliente
                  </div>
                </div>
              </div>
              <PortalNav activeTab={activeTab} />
              <div className="border-t border-border/60 px-3 py-3">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={signOut}>
                  <LogOut className="h-4 w-4" /> Sair
                </Button>
                <div className="px-2 pt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {theme?.footerLabel ?? (brand?.name ? `por ${brand.name}` : "portal white-label")}
                </div>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card px-3 py-2 lg:hidden">
                <PortalNav activeTab={activeTab} compact />
              </div>

              <header className="flex flex-col gap-3 border-b border-border/60 bg-background px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    {PORTAL_TABS.find((t) => t.id === activeTab)?.label}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Área privada de {client.name}. Todas as ações ficam registradas.
                  </p>
                </div>
                {links.length > 1 && (
                  <Select value={sessionQ.data.clientId ?? undefined} onValueChange={pickClient}>
                    <SelectTrigger className="h-9 w-56">
                      <SelectValue placeholder="Escolher marca" />
                    </SelectTrigger>
                    <SelectContent>
                      {links.map((l) => (
                        <SelectItem key={l.client_id} value={l.client_id}>
                          {l.client_name ?? "Cliente"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </header>

              <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </PortalIdentityProvider>
    </PortalModeProvider>
  );
}

const SESSION_SUFFIX: Record<PortalTabId, string> = {
  home: "/inicio",
  approvals: "/aprovacoes",
  calendar: "/calendario",
  files: "/arquivos",
  briefing: "/briefing",
};

function PortalNav({ activeTab, compact }: { activeTab: PortalTabId; compact?: boolean }) {
  const homePath = usePortalPath("home");
  void homePath;
  if (compact)
    return (
      <>
        {PORTAL_TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <PortalLink
              key={t.id}
              tab={t.id}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors ${
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </PortalLink>
          );
        })}
      </>
    );
  return (
    <nav className="flex-1 space-y-0.5 px-3 py-4">
      {PORTAL_TABS.map((t) => {
        const Icon = t.icon;
        const active = activeTab === t.id;
        return (
          <PortalLink
            key={t.id}
            tab={t.id}
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? "" : "text-muted-foreground/70"}`} />
            <span className="truncate">{t.label}</span>
          </PortalLink>
        );
      })}
    </nav>
  );
}
