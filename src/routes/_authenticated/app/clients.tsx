import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/clients")({
  component: ClientsPage,
});

const clients = [
  { name: "Nova Studio", niche: "Moda / DTC", color: "#f97316", posts: 48, health: 82, tone: "Aspiracional, editorial" },
  { name: "Ativa B2B", niche: "SaaS B2B", color: "#3b82f6", posts: 36, health: 61, tone: "Direto, consultivo" },
  { name: "Vitta Saúde", niche: "Rede de clínicas", color: "#10b981", posts: 58, health: 94, tone: "Confiável, empático" },
  { name: "Órbita Café", niche: "Food & Beverage", color: "#a855f7", posts: 22, health: 45, tone: "Descolado, coloquial" },
];

function ClientsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Clientes</h1>
          <p className="text-xs text-muted-foreground">{clients.length} marcas ativas · 164 posts este mês</p>
        </div>
        <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Novo cliente</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar cliente…" className="pl-8 text-xs" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {clients.map((c) => (
          <div key={c.name} className="group rounded-xl border border-border/60 bg-card/30 p-5 transition hover:border-primary/40">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: c.color }}>
                  {c.name.slice(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground">{c.niche}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition group-hover:opacity-100">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Tom: <span className="text-foreground">{c.tone}</span></span>
              <Badge variant="outline" className="text-[10px]">{c.posts} posts</Badge>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Health score</span><span className="font-mono">{c.health}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${c.health}%`,
                    background: c.health > 75 ? "#10b981" : c.health > 55 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}