import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { User, Users, Bot, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

const TABS = [
  { to: "/settings/profile", label: "Perfil", icon: User },
  { to: "/settings/team", label: "Equipe", icon: Users },
  { to: "/settings/ai", label: "Governança de IA", icon: Bot },
  { to: "/settings/logs", label: "Logs", icon: ScrollText },
] as const;

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-full flex-col">
      <nav className="sticky top-14 z-20 flex gap-1 overflow-x-auto border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur">
        {TABS.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}