import { Home, CheckSquare, CalendarDays, FolderOpen, FileText } from "lucide-react";

export type PortalTabId = "home" | "approvals" | "calendar" | "files" | "briefing";

/**
 * Fase 4a — cada aba do portal virou rota real. `to` é o path do TanStack
 * Router (com `$token` como param), `segment` é o sufixo usado para detectar
 * a aba ativa a partir do pathname.
 */
export const PORTAL_TABS: Array<{
  id: PortalTabId;
  label: string;
  icon: typeof Home;
  to: string;
  segment: string;
}> = [
  { id: "home", label: "Início", icon: Home, to: "/portal/$token/", segment: "" },
  { id: "approvals", label: "Aprovações", icon: CheckSquare, to: "/portal/$token/aprovacoes", segment: "aprovacoes" },
  { id: "calendar", label: "Calendário", icon: CalendarDays, to: "/portal/$token/calendario", segment: "calendario" },
  
  { id: "files", label: "Arquivos", icon: FolderOpen, to: "/portal/$token/arquivos", segment: "arquivos" },
  { id: "briefing", label: "Briefing", icon: FileText, to: "/portal/$token/briefing", segment: "briefing" },
];

export function activePortalTab(pathname: string, token: string): PortalTabId {
  const base = `/portal/${token}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/|\/$/g, "") : "";
  return PORTAL_TABS.find((t) => t.segment === rest)?.id ?? "home";
}
