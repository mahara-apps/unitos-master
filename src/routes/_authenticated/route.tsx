import { createFileRoute, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActiveContextProvider } from "@/hooks/use-active-context";
import { PageHeaderProvider, usePageHeaderState } from "@/hooks/use-page-header";
import { CommandMenu } from "@/components/command-menu";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications/notifications-drawer";
import { MandatoryPasswordReset } from "@/components/auth/mandatory-password-reset";
import { AiJobsProvider } from "@/components/ai-jobs/ai-jobs-provider";
import { AiJobsIndicator } from "@/components/ai-jobs/ai-jobs-indicator";

const fallbackTitles: Record<string, string> = {
  "/dashboard": "Painel",
  "/content": "Conteúdo",
  "/calendar": "Calendário",
  "/tasks": "Tarefas",
  "/projects": "Projetos",
  "/customers": "Clientes",
  "/agents": "Cérebro de Agentes",
  "/connections": "Conexões",
  "/settings/team": "Equipe",
  "/settings/ai": "Governança de IA",
  "/settings/logs": "Logs do sistema",
  "/settings/profile": "Perfil",
  "/settings": "Configurações",
  "/analytics": "Análises",
  "/notifications": "Notificações",
};

export const Route = createFileRoute("/_authenticated")({
  component: AppShell,
});

function AppShell() {
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStatus(data.session?.user ? "authenticated" : "unauthenticated");
    }

    validateSession();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !session?.user) {
        setStatus("unauthenticated");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setStatus("authenticated");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status !== "unauthenticated") return;
    navigate({ to: "/login", search: { next: href } as never, replace: true });
  }, [status, navigate, href]);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Carregando NexusFlow...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <ActiveContextProvider>
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
        </SidebarProvider>
        </AiJobsProvider>
      </PageHeaderProvider>
    </ActiveContextProvider>
  );
}

function ShellHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { title, subtitle, actions } = usePageHeaderState();
  const resolvedTitle = title ?? fallbackTitles[pathname] ?? "NexusFlow";
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
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
          <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </Button>
        {actions}
        <AiJobsIndicator />
        <NotificationsBell />
        <ThemeToggle />
      </div>
    </header>
  );
}