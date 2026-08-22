import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MandatoryPasswordReset } from "@/components/auth/mandatory-password-reset";
import { getMyPortalAccessFn } from "@/lib/portal-access.functions";

/**
 * Área autenticada do portal do cliente (Etapa 1 — login opcional).
 *
 * Convive com `/portal/$token/*`: nenhum link por token deixa de funcionar.
 * `ssr: false` porque a sessão Supabase vive no localStorage.
 */
export const Route = createFileRoute("/_portal")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const [user, access] = await Promise.all([getCachedUser(), getCachedPortalAccess()]);
    if (!user) {
      throw redirect({ to: "/login", search: { next: location.href } });
    }
    if (!access?.isPortalUser) {
      // Usuário interno não tem o que fazer na área do cliente.
      throw redirect({ to: "/dashboard" });
    }
    return { user, access };
  },
  component: PortalAreaShell,
});

function PortalAreaShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Outlet />
      <MandatoryPasswordReset />
    </div>
  );
}
