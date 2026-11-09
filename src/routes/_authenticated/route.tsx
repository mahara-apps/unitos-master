import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActiveContextProvider, useActiveContext } from "@/hooks/use-active-context";
import { PageHeaderProvider, usePageHeaderState } from "@/hooks/use-page-header";
import { CommandMenu } from "@/components/command-menu";
import { BackToOrigin } from "@/components/back-to-origin";
import { ActiveTimerChip } from "@/components/active-timer-chip";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications/notifications-drawer";
import { MandatoryPasswordReset } from "@/components/auth/mandatory-password-reset";
import { AiJobsProvider } from "@/components/ai-jobs/ai-jobs-provider";
import { AiJobsIndicator } from "@/components/ai-jobs/ai-jobs-indicator";
import { BrandFavicon } from "@/components/brand/brand-favicon";
import { AuthCheckTimeoutError, getCachedUser, resetLocalSession } from "@/lib/auth-cache";
import { getCachedPortalAccess } from "@/lib/access-cache";
import { isWorkspaceScopedQueryKey, queryKeyCarriesScopeId } from "@/lib/session-reset";
import { WorkspaceResolver } from "@/components/workspace-resolver";
import { AppLoading } from "@/components/app-loading";
import { ServiceStateBoundary } from "@/components/service-state-boundary";

const fallbackTitles: Record<string, string> = {
  "/dashboard": "Painel",
  "/content": "Conteúdo",
  "/calendar": "Calendário",
  "/tasks": "Tarefas",
  "/projects": "Projetos",
  "/customers": "Clientes",
  "/agents": "Cérebro de Agentes",
  "/connections": "Conexões",
  "/settings/profile": "Perfil",
  "/settings/notifications": "Notificações",
  "/settings/identity": "Agência",
  "/settings/team": "Equipe & Acesso",
  "/settings/permissions": "Permissões",
  "/settings/logs": "Auditoria",
  "/settings": "Configurações",
  "/analytics": "Análises",
  "/notifications": "Notificações",
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // O servidor não executa o gate desta subárvore. Enquanto a sessão é
  // validada mostramos um indicador central neutro (nunca `null`): tela em
  // branco fazia o usuário achar que o sistema quebrou.
  pendingComponent: () => <AppLoading fullscreen label="Preparando seu espaço…" />,
  beforeLoad: async ({ location }) => {
    // Usuário e escopo de portal vêm de cache deduplicado: o gate roda em toda
    // navegação e sem cache pagava 2 roundtrips seriais antes de renderizar.
    const [user, access] = await Promise.all([getCachedUser(), getCachedPortalAccess()]);
    if (!user) {
      await supabase.auth.signOut().catch(() => null);
      const next =
        location.href.startsWith("/") && !location.href.startsWith("/login")
          ? location.href
          : "/dashboard";
      throw redirect({ to: "/login", search: { next } });
    }
    // Cliente final (client_members.role = 'portal_client') NUNCA entra na UI
    // interna. O banco garante exclusividade (trigger
    // block_portal_client_team_link), então o vínculo de portal basta.
    if (access?.isPortalUser) {
      throw redirect({ to: "/area/inicio" });
    }
    return { user };
  },

  errorComponent: AuthGateError,
  component: AppShell,
});

function AuthGateError({ error, reset }: { error: unknown; reset: () => void }) {
  const isTimeout = error instanceof AuthCheckTimeoutError;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {isTimeout ? "Não conseguimos confirmar seu acesso" : "Não foi possível carregar esta tela"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isTimeout
            ? "A confirmação do login demorou demais. Tente de novo; se continuar, entre novamente."
            : "Tente novamente. Se continuar, entre novamente."}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => { reset(); window.location.reload(); }}>
            Tentar novamente
          </Button>
          <Button
            onClick={async () => {
              await resetLocalSession();
              window.location.assign("/login");
            }}
          >
            Entrar novamente
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Troca de workspace: as chaves de query já carregam `brandId`/`clientId`, então
 * o cache é naturalmente isolado e pode ser reutilizado ao voltar. Aqui apenas
 * descartamos as queries de escopo cuja chave NÃO carrega o workspace ativo —
 * remover tudo derrubava também as queries do NOVO workspace que já iniciaram
 * neste mesmo commit, causando refetch em cascata e travando a troca.
 */
function WorkspaceQueryReset() {
  const { brandId, clientId } = useActiveContext();
  const queryClient = useQueryClient();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = brandId;
    if (!before || !brandId || before === brandId) return;
    queryClient.removeQueries({
      predicate: (q) =>
        isWorkspaceScopedQueryKey(q.queryKey) &&
        !queryKeyCarriesScopeId(q.queryKey, [brandId, clientId]),
    });
  }, [brandId, clientId, queryClient]);
  return null;
}

function AppShell() {
  return (
    <ServiceStateBoundary>
      <AppShellContent />
    </ServiceStateBoundary>
  );
}

function AppShellContent() {
  return (
    <ActiveContextProvider>
      <WorkspaceResolver />
      <WorkspaceQueryReset />

      <PageHeaderProvider>
        <AiJobsProvider>
          <SidebarProvider>
            <div className="flex min-h-screen w-full bg-background">
              <AppSidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <ShellHeader />
                <main className="min-w-0 flex-1">
                  <Outlet />
                </main>
              </div>
            </div>
            <CommandMenu />
            <MandatoryPasswordReset />
            <BrandFavicon />
          </SidebarProvider>
        </AiJobsProvider>
      </PageHeaderProvider>
    </ActiveContextProvider>
  );
}

function ShellHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { title, subtitle, actions } = usePageHeaderState();
  const resolvedTitle = title ?? fallbackTitles[pathname] ?? "Unitos";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <BackToOrigin title={resolvedTitle} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{resolvedTitle}</span>
          {subtitle ? (
            <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs text-muted-foreground"
          onClick={() => {
            const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true });
            document.dispatchEvent(ev);
          }}
        >
          <Command className="h-3 w-3" /> Buscar
          <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </Button>
        {actions}
        <ActiveTimerChip />
        <AiJobsIndicator />
        <NotificationsBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
