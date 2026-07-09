import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, MessageSquare, AlertTriangle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const items = [
  { icon: CheckCircle2, color: "text-emerald-400", title: "Cliente aprovou 'Reels: 3 erros no funil'", time: "há 4 min", client: "Ativa B2B" },
  { icon: MessageSquare, color: "text-blue-400", title: "Novo comentário: 'trocar cor do CTA'", time: "há 22 min", client: "Nova Studio" },
  { icon: Sparkles, color: "text-purple-400", title: "IA finalizou 3 variações de arte", time: "há 1h", client: "Vitta Saúde" },
  { icon: AlertTriangle, color: "text-amber-400", title: "Orçamento de IA atingiu 80% do teto", time: "há 3h", client: "—" },
];

function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h1 className="text-lg font-semibold">Notificações</h1>
        <Badge variant="outline" className="text-[10px]">4 novas</Badge>
      </div>
      <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card/30">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-background/40">
            <it.icon className={`mt-0.5 h-4 w-4 ${it.color}`} />
            <div className="flex-1">
              <div className="text-sm">{it.title}</div>
              <div className="text-[11px] text-muted-foreground">{it.client} · {it.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}