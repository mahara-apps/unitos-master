import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Calendar, Users, FolderKanban, Bell, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandSwitcher, ClientSwitcher } from "./brand-client-switcher";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { title: "Dashboard", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Trabalho", url: "/app/work", icon: ListChecks },
  { title: "Calendário", url: "/app/calendar", icon: Calendar },
  { title: "Projetos", url: "/app/projects", icon: FolderKanban },
  { title: "Clientes", url: "/app/clients", icon: Users },
  { title: "Notificações", url: "/app/notifications", icon: Bell },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (u: string) => pathname === u || pathname.startsWith(u + "/");
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-1">
        <BrandSwitcher />
        <ClientSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sair"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}