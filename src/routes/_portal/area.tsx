import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listMyPortalClientsFn, resolvePortalSessionFn } from "@/lib/portal-session.functions";
import {
  FullScreenLoader,
  PortalAccessError,
} from "@/components/portal/portal-shared";
import { PortalModeProvider } from "@/components/portal/portal-context";
import { PortalShell } from "@/components/portal/portal-shell";
import { activePortalTab } from "@/components/portal/portal-nav";
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
 * Portal por login — usa o SHELL ÚNICO (`PortalShell`) e a navegação única
 * (`portal-nav`). A diferença do modo token fica isolada em `PortalModeProvider`.
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
  const [scopeReady, setScopeReady] = useState(false);
  const pickClient = (id: string) => {
    setClientId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const linksQ = useQuery({
    queryKey: ["portal", "my-clients"],
    queryFn: () => listClients(),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!linksQ.data) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    const validSaved = linksQ.data.some((link) => link.client_id === saved) ? saved : null;
    const next = validSaved ?? linksQ.data[0]?.client_id ?? null;
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
    setClientId(next);
    setScopeReady(true);
  }, [linksQ.data]);
  const sessionQ = useQuery({
    queryKey: ["portal", "session", clientId ?? "default"],
    queryFn: () => resolve({ data: clientId ? { clientId } : {} }),
    enabled: scopeReady,
    retry: 1,
    staleTime: 60_000,
  });

  if (linksQ.isLoading || !scopeReady || sessionQ.isLoading) return <FullScreenLoader />;
  if (linksQ.isError || sessionQ.isError)
    return (
      <PortalAccessError
        mode="session"
        message={((linksQ.error ?? sessionQ.error) as Error)?.message}
        onRetry={() => { void linksQ.refetch(); void sessionQ.refetch(); }}
      />
    );
  if (!sessionQ.data?.client)
    return <PortalAccessError mode="session" message={sessionQ.data?.error} onRetry={() => void sessionQ.refetch()} />;

  const client = sessionQ.data.client;
  const brand = sessionQ.data.brand;
  const theme = sessionQ.data.theme;
  const accent = theme?.accent || client.color || "#6366F1";
  const links = linksQ.data ?? [];
  const activeTab = activePortalTab(pathname, "/area");

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <PortalModeProvider value={{ kind: "session", clientId: sessionQ.data.clientId }}>
      <PortalShell
          clientName={client.name}
          activeTab={activeTab}
          accent={accent}
          dark={theme?.dark}
          logoUrl={theme?.logoUrl ?? null}
          footerLabel={theme?.footerLabel ?? (brand?.name ? `por ${brand.name}` : "")}
          headerActions={
            <>
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
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </>
          }
        >
          <Outlet />
      </PortalShell>
    </PortalModeProvider>
  );
}
