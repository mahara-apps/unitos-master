import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Bell,
  LogOut,
  KanbanSquare,
  BarChart3,
  Plug,
  UserPlus,
  User as UserIcon,
  ChevronsUpDown,
} from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandSwitcher, ClientSwitcher } from "./brand-client-switcher";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const items = [
  { title: "Painel", url: "/dashboard", icon: LayoutDashboard },
  { title: "Conteúdo", url: "/content", icon: KanbanSquare },
  { title: "Clientes", url: "/customers", icon: Users },
  { title: "Análises", url: "/analytics", icon: BarChart3 },
  { title: "Notificações", url: "/notifications", icon: Bell },
  { title: "Equipe", url: "/settings/team", icon: UserPlus },
  { title: "Connections", url: "/connections", icon: Plug },
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
            <UserProfileMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function UserProfileMenu() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      setUser({
        email: u.email ?? undefined,
        name: (meta.full_name as string) || (meta.name as string) || undefined,
      });
    });
  }, []);

  const label = user?.name || user?.email || "Minha conta";
  const initials = (user?.name || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          tooltip={label}
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-6 w-6 rounded-md">
            <AvatarFallback className="rounded-md bg-indigo-600 text-[10px] font-medium text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-xs leading-tight">
            <span className="truncate font-medium">{user?.name || "Minha conta"}</span>
            {user?.email ? (
              <span className="truncate text-[10px] text-muted-foreground">{user.email}</span>
            ) : null}
          </div>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 opacity-60" />
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[--radix-popover-trigger-width] min-w-56 rounded-lg p-1"
      >
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar className="h-8 w-8 rounded-md">
            <AvatarFallback className="rounded-md bg-indigo-600 text-xs font-medium text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-xs leading-tight">
            <span className="truncate font-medium">{user?.name || "Minha conta"}</span>
            {user?.email ? (
              <span className="truncate text-[10px] text-muted-foreground">{user.email}</span>
            ) : null}
          </div>
        </div>
        <div className="my-1 h-px bg-border" />
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
        >
          <UserIcon className="h-3.5 w-3.5" />
          <span>Perfil do usuário</span>
        </Link>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sair</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}