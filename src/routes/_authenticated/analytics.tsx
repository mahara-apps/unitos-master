import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

const kpis = [
  { label: "Posts publicados", value: "142", delta: "+18%", tone: "text-emerald-400" },
  { label: "Aprovação em 1ª rodada", value: "78%", delta: "+6pp", tone: "text-emerald-400" },
  { label: "Tempo médio brief→publicado", value: "2.4d", delta: "-11h", tone: "text-emerald-400" },
  { label: "Custo médio por post", value: "$1.32", delta: "-$0.18", tone: "text-emerald-400" },
];

const perClient = [
  { name: "Nova Studio", color: "#f97316", posts: 48, approval: 84, engagement: 5.2 },
  { name: "Ativa B2B", color: "#3b82f6", posts: 36, approval: 72, engagement: 3.8 },
  { name: "Vitta Saúde", color: "#10b981", posts: 58, approval: 89, engagement: 6.1 },
];

const weeks = [3, 5, 4, 8, 6, 9, 12, 10, 14, 11, 16, 18];
const max = Math.max(...weeks);

function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold">Analytics da agência</h1>
        <p className="text-xs text-muted-foreground">Últimos 30 dias · comparado com período anterior</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border/60 bg-card/30 p-4">
            <div className="text-[11px] text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
            <div className={`mt-1 text-[11px] font-medium ${k.tone}`}>{k.delta}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border/60 bg-card/30 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Produção por semana</h2>
            <p className="text-[11px] text-muted-foreground">Volume de posts finalizados</p>
          </div>
          <Badge variant="outline" className="text-[10px]">12 semanas</Badge>
        </div>
        <div className="flex h-40 items-end gap-2">
          {weeks.map((v, i) => (
            <div key={i} className="group relative flex flex-1 items-end">
              <div
                className="w-full rounded-t bg-gradient-to-t from-primary/60 to-primary transition group-hover:from-primary/80 group-hover:to-primary"
                style={{ height: `${(v / max) * 100}%` }}
              />
              <div className="absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-popover px-1.5 py-0.5 text-[10px] group-hover:block">
                {v}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card/30">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-sm font-medium">Desempenho por cliente</h2>
        </div>
        <div className="divide-y divide-border/60">
          {perClient.map((c) => (
            <div key={c.name} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-5 py-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="font-medium">{c.name}</span>
              </div>
              <div className="text-muted-foreground"><span className="font-mono text-foreground">{c.posts}</span> posts</div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.approval}%` }} />
                </div>
                <span className="font-mono">{c.approval}%</span>
              </div>
              <div className="font-mono text-muted-foreground"><span className="text-foreground">{c.engagement}%</span> eng.</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}