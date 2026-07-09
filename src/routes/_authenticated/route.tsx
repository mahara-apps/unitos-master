import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActiveContextProvider } from "@/hooks/use-active-context";
import { CommandMenu } from "@/components/command-menu";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";

const titles: Record<string, string> = {
  "/dashboard": "Painel",
  "/content": "Conteúdo",
  "/customers": "Clientes",
  "/settings/ai": "Configurações de IA",
  "/analytics": "Análises",
  "/notifications": "Notificações",
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { user: data.user };
  },
  component: AppShell,
});

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = titles[pathname] ?? "NexusFlow";
  return (
    <ActiveContextProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <span className="text-sm font-medium">{title}</span>
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
                <ThemeToggle />
              </div>
            </header>
            <main className="min-w-0 flex-1">
              <Outlet />
            </main>
          </div>
        </div>
        <CommandMenu />
      </SidebarProvider>
    </ActiveContextProvider>
  );
}