import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Loader2, Printer, ShieldCheck } from "lucide-react";
import {
  resolveMediaPlanPublic,
  listMediaPlanPublicItems,
  type MediaPlanPublicItem,
  type MediaPlanPublicResolve,
} from "@/lib/media-plan-public.functions";

const searchSchema = z.object({ token: z.string().min(8) });
type Search = { token: string };

export const Route = createFileRoute("/plano/$planId")({
  validateSearch: (raw: Record<string, unknown>): Search => searchSchema.parse(raw),
  component: PublicMediaPlanPage,
  head: () => ({
    meta: [
      { title: "Plano de Mídia — Apresentação" },
      { name: "description", content: "Apresentação do plano de mídia paga." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const CURRENCY = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );
const PCT = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;

const STAGE_LABEL: Record<string, string> = {
  topo: "TOPO DO FUNIL",
  meio: "MEIO DO FUNIL",
  fundo: "FUNDO DO FUNIL",
};
const STAGE_ORDER: Array<"topo" | "meio" | "fundo"> = ["topo", "meio", "fundo"];
const STAGE_ACCENT: Record<string, string> = {
  topo: "#C8FF00",
  meio: "#C8FF00",
  fundo: "#C8FF00",
};

function PublicMediaPlanPage() {
  const { planId } = Route.useParams();
  const { token } = Route.useSearch();

  const resolveFn = useServerFn(resolveMediaPlanPublic);
  const itemsFn = useServerFn(listMediaPlanPublicItems);

  const resolveQ = useQuery<MediaPlanPublicResolve>({
    queryKey: ["public-media-plan", planId, token],
    queryFn: () => resolveFn({ data: { token } }),
    retry: false,
  });
  const itemsQ = useQuery<MediaPlanPublicItem[]>({
    queryKey: ["public-media-plan-items", planId, token],
    queryFn: () => itemsFn({ data: { token } }),
    enabled: resolveQ.isSuccess,
  });

  useEffect(() => {
    document.documentElement.dataset.plano = "presentation";
    return () => {
      delete document.documentElement.dataset.plano;
    };
  }, []);

  if (resolveQ.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080808] text-[#e6e6e6]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando plano…
      </div>
    );
  }
  if (resolveQ.isError || !resolveQ.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#080808] text-[#e6e6e6]">
        <ShieldCheck className="mb-2 h-8 w-8 text-[#C8FF00]" />
        <div className="text-lg">Link inválido ou expirado.</div>
        <div className="text-sm text-white/60">Solicite um novo link ao responsável pela campanha.</div>
      </div>
    );
  }

  const plan = resolveQ.data.plan;
  const client = resolveQ.data.client;
  const brand = resolveQ.data.brand;
  const items = itemsQ.data ?? [];

  return <Presentation plan={plan} client={client} brand={brand} items={items} />;
}

function Presentation({
  plan,
  client,
  brand,
  items,
}: {
  plan: MediaPlanPublicResolve["plan"];
  client: MediaPlanPublicResolve["client"];
  brand: MediaPlanPublicResolve["brand"];
  items: MediaPlanPublicItem[];
}) {
  const totalAmount = useMemo(
    () => items.reduce((s, i) => s + Number(i.budget_amount || 0), 0),
    [items],
  );
  const totalPct = useMemo(
    () => items.reduce((s, i) => s + Number(i.budget_pct || 0), 0),
    [items],
  );
  const byStage = useMemo(() => {
    const g: Record<string, MediaPlanPublicItem[]> = { topo: [], meio: [], fundo: [] };
    for (const i of items) {
      const s = i.funnel_stage ?? "meio";
      (g[s] ||= []).push(i);
    }
    return g;
  }, [items]);
  const byChannel = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      const k = i.channel ?? "Outros";
      m.set(k, (m.get(k) ?? 0) + Number(i.budget_amount || 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const [donutHover, setDonutHover] = useState<number | null>(null);

  return (
    <div
      className="min-h-screen bg-[#080808] text-[#f2f2f2]"
      style={{
        fontFamily:
          '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;700&display=swap');
        .h-bebas { font-family: "Bebas Neue", Impact, sans-serif; letter-spacing: 0.02em; }
        @media print {
          html, body { background: #080808 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; break-after: page; }
        }
      `}</style>

      {/* Sticky header */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#080808]/85 backdrop-blur no-print">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#C8FF00]" />
            <div className="text-sm text-white/70">
              {brand.name} <span className="mx-1 text-white/30">·</span>{" "}
              <span className="text-white">{client.name}</span>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-widest text-white/80 hover:bg-white/10"
          >
            <Printer className="h-3.5 w-3.5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(1200px 400px at 20% 0%, rgba(200,255,0,0.10), transparent 60%), radial-gradient(800px 400px at 100% 20%, rgba(200,255,0,0.08), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16">
          <div className="mb-6 text-xs uppercase tracking-[0.35em] text-[#C8FF00]">
            Plano de mídia paga
          </div>
          <h1 className="h-bebas text-6xl leading-[0.95] sm:text-7xl md:text-8xl">
            {plan.title}
          </h1>
          <div className="mt-6 max-w-2xl text-white/70">
            {client.name} · {plan.period_start ? `${formatDate(plan.period_start)}` : ""}
            {plan.period_end ? ` — ${formatDate(plan.period_end)}` : ""}
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <HeroStat label="Investimento mensal" value={CURRENCY(plan.monthly_budget)} />
            <HeroStat label="Alocado" value={CURRENCY(totalAmount)} sub={PCT(totalPct)} />
            <HeroStat label="Iniciativas" value={String(items.length)} />
          </div>
        </div>
      </section>

      {/* Funnel */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionTitle kicker="01" title="Estratégia por funil" />
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {STAGE_ORDER.map((stage) => {
            const rows = byStage[stage] ?? [];
            const sub = rows.reduce((s, r) => s + Number(r.budget_amount || 0), 0);
            const subPct = rows.reduce((s, r) => s + Number(r.budget_pct || 0), 0);
            return (
              <div
                key={stage}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold tracking-[0.3em] text-[#C8FF00]">
                    {STAGE_LABEL[stage]}
                  </div>
                  <div className="text-xs text-white/50">{rows.length} iniciativas</div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div className="h-bebas text-4xl">{CURRENCY(sub)}</div>
                  <div className="text-sm text-white/60">{PCT(subPct)}</div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, subPct)}%`,
                      background: STAGE_ACCENT[stage],
                    }}
                  />
                </div>
                <div className="mt-5 space-y-2">
                  {rows.slice(0, 4).map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="truncate text-white/85">
                        {r.product_service || r.campaign_type || "Iniciativa"}
                      </div>
                      <div className="whitespace-nowrap text-white/50">
                        {r.channel || "—"}
                      </div>
                    </div>
                  ))}
                  {rows.length > 4 && (
                    <div className="text-xs text-white/40">+{rows.length - 4} outras</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="page-break" />

      {/* Channel mix — donut */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionTitle kicker="02" title="Mix de canais" />
        <div className="mt-8 grid grid-cols-1 items-center gap-10 md:grid-cols-2">
          <div className="relative mx-auto h-72 w-72">
            <Donut
              slices={byChannel.map(([k, v]) => ({ label: k, value: v }))}
              onHover={setDonutHover}
              hoverIndex={donutHover}
              color="#C8FF00"
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Total</div>
              <div className="h-bebas text-4xl leading-none">{CURRENCY(totalAmount)}</div>
            </div>
          </div>
          <div className="space-y-2">
            {byChannel.map(([k, v], idx) => {
              const share = totalAmount > 0 ? (v / totalAmount) * 100 : 0;
              const active = donutHover === idx;
              return (
                <div
                  key={k}
                  onMouseEnter={() => setDonutHover(idx)}
                  onMouseLeave={() => setDonutHover(null)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                    active
                      ? "border-[#C8FF00]/60 bg-[#C8FF00]/[0.06]"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: active ? "#C8FF00" : "rgba(200,255,0,0.55)" }}
                    />
                    <div className="text-sm">{k}</div>
                  </div>
                  <div className="flex items-center gap-4 tabular-nums text-white/70">
                    <span>{PCT(share)}</span>
                    <span className="text-white">{CURRENCY(v)}</span>
                  </div>
                </div>
              );
            })}
            {byChannel.length === 0 && (
              <div className="text-sm text-white/50">Sem canais definidos.</div>
            )}
          </div>
        </div>
      </section>

      <div className="page-break" />

      {/* Detailed table */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionTitle kicker="03" title="Detalhamento" />
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_0.9fr_0.9fr_0.9fr] gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
            <span>Produto</span>
            <span>Campanha</span>
            <span>Etapa</span>
            <span>Canal</span>
            <span>KPI</span>
            <span className="text-right">%</span>
            <span className="text-right">R$</span>
          </div>
          {items.map((i) => (
            <div
              key={i.id}
              className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_0.9fr_0.9fr_0.9fr] gap-3 border-b border-white/5 px-5 py-3 text-sm"
            >
              <div className="text-white/90">{i.product_service || "—"}</div>
              <div className="text-white/70">{i.campaign_type || "—"}</div>
              <div className="text-white/70">
                {i.funnel_stage ? STAGE_LABEL[i.funnel_stage].split(" ")[0] : "—"}
              </div>
              <div className="text-white/70">{i.channel || "—"}</div>
              <div className="text-white/60">{i.main_kpi || "—"}</div>
              <div className="text-right tabular-nums text-white/70">
                {PCT(Number(i.budget_pct || 0))}
              </div>
              <div className="text-right tabular-nums text-white">
                {CURRENCY(Number(i.budget_amount || 0))}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-white/50">
              Nenhuma iniciativa cadastrada.
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/50">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-8 md:flex-row md:items-center">
          <div className="text-xs text-white/40">
            © {new Date().getFullYear()} {brand.name}. Documento confidencial.
          </div>
          <div className="text-xs text-white/40">
            Atualizado em {formatDate(plan.updated_at)}
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">{label}</div>
      <div className="mt-2 h-bebas text-4xl leading-none">{value}</div>
      {sub && <div className="mt-1 text-xs text-[#C8FF00]">{sub}</div>}
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-4">
      <div className="flex items-baseline gap-4">
        <div className="text-xs font-bold tracking-[0.4em] text-[#C8FF00]">{kicker}</div>
        <h2 className="h-bebas text-4xl">{title}</h2>
      </div>
    </div>
  );
}

function Donut({
  slices,
  color,
  hoverIndex,
  onHover,
}: {
  slices: Array<{ label: string; value: number }>;
  color: string;
  hoverIndex: number | null;
  onHover: (i: number | null) => void;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const size = 288;
  const stroke = 34;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      {slices.map((s, idx) => {
        const frac = s.value / total;
        const dash = c * frac;
        const el = (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeOpacity={hoverIndex === null ? 0.5 + idx * 0.08 : hoverIndex === idx ? 1 : 0.15}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            onMouseEnter={() => onHover(idx)}
            onMouseLeave={() => onHover(null)}
            style={{ cursor: "pointer", transition: "stroke-opacity 200ms" }}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
