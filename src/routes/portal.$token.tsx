import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { resolvePortalTokenFn } from "@/lib/portal-public.functions";
import { FullScreenLoader, PortalIdentityProvider, TokenError } from "@/components/portal/portal-shared";
import { PortalModeProvider } from "@/components/portal/portal-context";
import { PORTAL_TABS, activePortalTab } from "@/components/portal/portal-nav";

export const Route = createFileRoute("/portal/$token")({
  component: PortalShell,
  head: () => ({
    meta: [
      { title: "Portal do cliente" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function useIdentity(clientId: string | null) {
  const key = clientId ? `portal.identity.${clientId}` : null;
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!key) return;
    setValue(localStorage.getItem(key) ?? "");
  }, [key]);
  const save = (v: string) => {
    setValue(v);
    if (key) localStorage.setItem(key, v);
  };
  return { value, save };
}

function PortalShell() {
  const { token } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const resolve = useServerFn(resolvePortalTokenFn);
  const sessionQ = useQuery({
    queryKey: ["portal", "session", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const identity = useIdentity(sessionQ.data?.clientId ?? null);
  const activeTab = activePortalTab(pathname, token);

  if (sessionQ.isLoading) return <FullScreenLoader />;
  if (sessionQ.error || !sessionQ.data?.client)
    return <TokenError message={sessionQ.data?.error ?? (sessionQ.error as Error)?.message} />;

  const client = sessionQ.data.client;
  const brand = sessionQ.data.brand;
  // Fase 3 — tema já validado no server (hex/URL). Sem customização, cai no
  // accent de clients.color, iniciais como avatar e crédito da agência.
  const theme = sessionQ.data.theme;
  const accent = theme?.accent || client.color || "#6366F1";
  const logoUrl = theme?.logoUrl ?? null;
  const initials = (client.name || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <PortalModeProvider value={{ kind: "token", token }}>
    <PortalIdentityProvider value={identity}>
      <div
        className={`min-h-screen bg-background text-foreground ${theme?.dark ? "dark" : ""}`}
        style={{
          ["--portal-accent" as string]: accent,
          ...(theme?.bg ? { ["--background" as string]: theme.bg, background: theme.bg } : {}),
        }}
      >
        <div className="flex min-h-screen">
          {/* White-label sidebar */}
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card lg:flex">
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-5">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={client.name ?? "Logo"}
                  className="h-10 w-10 shrink-0 rounded-xl object-contain"
                />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm"
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
            <nav className="flex-1 space-y-0.5 px-3 py-4">
              {PORTAL_TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <Link
                    key={t.id}
                    to={t.to}
                    params={{ token }}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "" : "text-muted-foreground/70"}`} />
                    <span className="truncate">{t.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border/60 px-5 py-4 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {theme?.showAgencyCredit === false
                ? theme?.footerLabel ?? ""
                : theme?.footerLabel ?? (brand?.name ? `por ${brand.name}` : "portal white-label")}
            </div>
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top nav */}
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card px-3 py-2 lg:hidden">
              {PORTAL_TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <Link
                    key={t.id}
                    to={t.to}
                    params={{ token }}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors ${
                      active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </Link>
                );
              })}
            </div>

            {/* Header */}
            <header className="flex flex-col gap-3 border-b border-border/60 bg-background px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  {PORTAL_TABS.find((t) => t.id === activeTab)?.label}
                </h1>
                <p className="text-xs text-muted-foreground">Área privada de {client.name}. Todas as ações ficam registradas.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={identity.value}
                  onChange={(e) => identity.save(e.target.value)}
                  placeholder="Seu nome (para registrar decisões)"
                  className="h-9 w-64"
                />
              </div>
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
