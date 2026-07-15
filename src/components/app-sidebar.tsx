import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import {
  LayoutDashboard,
  Bell,
  LogOut,
  KanbanSquare,
  BarChart3,
  Plug,
  UserPlus,
  User as UserIcon,
  ChevronsUpDown,
  Sparkles,
  Link2,
  ListChecks,
  CalendarDays,
  FolderKanban,
  FileBarChart,
  Workflow,
  Bot,
  Gift,
  Megaphone,
  Users,
  Settings as SettingsIcon,
  ScrollText,
  Target,
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ContextSwitcher } from "./brand-client-switcher";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAccessRole } from "@/hooks/use-access-role";
import { canAccessSidebarUrl } from "@/lib/permissions";

type NavItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Operação",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Conteúdo", url: "/content", icon: KanbanSquare },
      { title: "Calendário", url: "/calendar", icon: CalendarDays },
      { title: "Mídia paga", url: "/media-plans", icon: Target },
      { title: "Tarefas", url: "/tasks", icon: ListChecks },
      { title: "Projetos", url: "/projects", icon: FolderKanban },
      { title: "Clientes", url: "/customers", icon: Users },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Integrações", url: "/connections", icon: Plug },
      { title: "Agentes IA", url: "/agents", icon: Bot },
      { title: "Notificações", url: "/notifications", icon: Bell },
      { title: "Logs do sistema", url: "/settings/logs", icon: ScrollText },
      { title: "Configurações", url: "/settings", icon: SettingsIcon },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (u: string) => pathname === u || pathname.startsWith(u + "/");
  const { role } = useAccessRole();
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccessSidebarUrl(role, i.url)) }))
    .filter((g) => g.items.length > 0);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 flex-row items-center justify-between gap-2 border-b border-sidebar-border/60 px-3 py-0 group-data-[collapsible=icon]:px-2">
        <Link
          to="/dashboard"
          className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">
            NexusFlow
          </span>
        </Link>
        <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground group-data-[collapsible=icon]:mx-auto" />
      </SidebarHeader>
      <SidebarContent>
        <div className="px-2 pt-2">
          <ContextSwitcher />
        </div>
        {visibleGroups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
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
        ))}
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
  useSidebar();
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => fetchProfile(),
    staleTime: 30_000,
  });
  const user = profile
    ? { email: profile.email ?? undefined, name: profile.full_name || undefined }
    : null;

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
          to="/settings/profile"
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