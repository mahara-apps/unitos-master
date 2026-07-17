import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
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
import { BrandFavicon } from "@/components/brand/brand-favicon";

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
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      await supabase.auth.signOut().catch(() => null);
      const next = location.href.startsWith("/") && !location.href.startsWith("/login") ? location.href : "/dashboard";
      throw redirect({ to: "/login", search: { next } });
    }
    return { user: data.user };
  },
  component: AppShell,
});

function AppShell() {
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