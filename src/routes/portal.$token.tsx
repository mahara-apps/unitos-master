import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { resolvePortalTokenFn } from "@/lib/portal-public.functions";
import { FullScreenLoader, PortalIdentityProvider, TokenError } from "@/components/portal/portal-shared";
import { PortalModeProvider } from "@/components/portal/portal-context";
import { PortalShell } from "@/components/portal/portal-shell";
import { activePortalTab } from "@/components/portal/portal-nav";

/**
 * Portal por link (token) — mesma casca do portal por login (`PortalShell`) e a
 * mesma navegação única. Só a identidade digitada é exclusiva deste modo.
 */
export const Route = createFileRoute("/portal/$token")({
  component: PortalShellRoute,
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

function PortalShellRoute() {
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
  const activeTab = activePortalTab(pathname, `/portal/${token}`);

  if (sessionQ.isLoading) return <FullScreenLoader />;
  if (sessionQ.error || !sessionQ.data?.client)
    return <TokenError message={sessionQ.data?.error ?? (sessionQ.error as Error)?.message} />;

  const client = sessionQ.data.client;
  const brand = sessionQ.data.brand;
  const theme = sessionQ.data.theme;
  const accent = theme?.accent || client.color || "#6366F1";

  return (
    <PortalModeProvider value={{ kind: "token", token }}>
      <PortalIdentityProvider value={identity}>
        <PortalShell
          clientName={client.name}
          activeTab={activeTab}
          accent={accent}
          dark={theme?.dark}
          logoUrl={theme?.logoUrl ?? null}
          background={theme?.bg ?? null}
          footerLabel={
            theme?.showAgencyCredit === false
              ? theme?.footerLabel ?? ""
              : theme?.footerLabel ?? (brand?.name ? `por ${brand.name}` : "")
          }
          headerActions={
            <Input
              value={identity.value}
              onChange={(e) => identity.save(e.target.value)}
              placeholder="Seu nome (para registrar decisões)"
              className="h-9 w-64"
            />
          }
        >
          <Outlet />
        </PortalShell>
      </PortalIdentityProvider>
    </PortalModeProvider>
  );
}
