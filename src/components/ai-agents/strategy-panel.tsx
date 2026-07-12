import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, Users, Layers, Target, TrendingUp, ShieldAlert, Zap, Sparkles, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  sendPautaToContentFn,
} from "@/lib/ai-agents.functions";
import {
  customerCoreQuery,
  customerTargetQuery,
  customerMarketQuery,
  customerPautasQuery,
} from "@/lib/customer-queries";
import { ContextSourceBadge } from "./context-source-badge";

type Scope = { brandId: string; clientId: string };

// ---------- normalizers (tolerate `{__raw: "..."}` payloads from AI) ----------

function tryParseJson(input: string): unknown {
  // Strip markdown fences
  let s = input.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(s); } catch { /* try repair */ }
  // Remove trailing junk after last balanced brace/bracket
  const lastCurly = s.lastIndexOf("}");
  const lastSquare = s.lastIndexOf("]");
  const end = Math.max(lastCurly, lastSquare);
  if (end > 0) {
    try { return JSON.parse(s.slice(0, end + 1)); } catch { /* noop */ }
  }
  return null;
}

function extractRaw<T = unknown>(data: unknown): T | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.__raw === "string") {
    const parsed = tryParseJson(d.__raw);
    return (parsed as T) ?? null;
  }
  return data as T;
}

type RawPersona = Record<string, unknown>;
type NormalizedPersona = { nome: string; descricao: string; dores: string[]; canais_preferidos: string[] };

function normalizePersonas(data: unknown): NormalizedPersona[] {
  const parsed = extractRaw<unknown>(data);
  if (!parsed) return [];
  const arr: RawPersona[] = Array.isArray(parsed)
    ? (parsed as RawPersona[])
    : Array.isArray((parsed as { personas?: unknown }).personas)
      ? ((parsed as { personas: RawPersona[] }).personas)
      : [];
  return arr.map((p) => {
    const dorPrincipal = p.dor_principal as string | undefined;
    const dores = Array.isArray(p.dores) ? (p.dores as string[]) : dorPrincipal ? [dorPrincipal] : [];
    return {
      nome: (p.nome as string) ?? (p.name as string) ?? "Persona",
      descricao: (p.perfil as string) ?? (p.descricao as string) ?? (p.description as string) ?? "",
      dores,
      canais_preferidos: Array.isArray(p.canais_preferidos)
        ? (p.canais_preferidos as string[])
        : Array.isArray(p.ganchos_sugeridos)
          ? []
          : [],
    };
  });
}

type NormalizedCohort = { name: string; target_personas: string[]; behavioral_traits: string; content_strategy: string; conversion_criteria: string };

function normalizeCohorts(data: unknown): NormalizedCohort[] {
  const parsed = extractRaw<unknown>(data);
  if (!parsed) return [];
  const arr: Record<string, unknown>[] = Array.isArray(parsed)
    ? (parsed as Record<string, unknown>[])
    : Array.isArray((parsed as { cohorts?: unknown }).cohorts)
      ? ((parsed as { cohorts: Record<string, unknown>[] }).cohorts)
      : [];
  return arr.map((c) => ({
    name: (c.name as string) ?? "Cohort",
    target_personas: Array.isArray(c.target_personas) ? (c.target_personas as string[]) : [],
    behavioral_traits: (c.behavioral_traits as string) ?? "",
    content_strategy: (c.content_strategy as string) ?? "",
    conversion_criteria: (c.conversion_criteria as string) ?? "",
  }));
}

// ---------- helpers ----------

function SectionCard({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-neutral-950/60 p-5 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-cyan-400" />}
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" | "success" | "info" }) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : tone === "info"
      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
      : "border-white/10 bg-white/5 text-neutral-200";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

// ---------- OVERVIEW ----------

export function OverviewTab({ brandId, clientId }: Scope) {
  // Suspende paralelamente nas três fatias — TanStack Query dispara em paralelo.
  const { data: core } = useSuspenseQuery(customerCoreQuery({ brandId, clientId }));
  const { data: target } = useSuspenseQuery(customerTargetQuery({ brandId, clientId }));
  const { data: market } = useSuspenseQuery(customerMarketQuery({ brandId, clientId }));

  const briefing = (core.briefing?.data ?? {}) as Record<string, unknown>;
  const voice = (core.voice?.data as { voice_card?: { brand_personality?: string; tone_characteristics?: string[] } } | null)?.voice_card;
  const personas = normalizePersonas(target.personas?.data);
  const cohorts = normalizeCohorts(target.cohorts?.data);
  const swot = (market.swot?.data as { swot_analysis?: Record<string, string[]> } | null)?.swot_analysis;

  const kpis = [
    { label: "Completude briefing", value: `${core.briefing?.completude ?? 0}%` },
    { label: "Personas", value: personas.length },
    { label: "Cohorts", value: cohorts.length },
    { label: "Forças (SWOT)", value: swot?.strengths?.length ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-white/10 bg-neutral-950/60 p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-2xl font-semibold">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Brand personality" icon={Sparkles}>
          <div className="mb-3">
            <ContextSourceBadge source="persona" />
          </div>
          {voice?.brand_personality ? (
            <p className="text-sm leading-relaxed text-neutral-200">{voice.brand_personality}</p>
          ) : (
            <EmptyHint text="Voice card ainda não gerado." />
          )}
          {voice?.tone_characteristics?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {voice.tone_characteristics.map((t, i) => (
                <Chip key={i} tone="info">{t}</Chip>
              ))}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Público-alvo" icon={Target}>
          <div className="mb-3">
            <ContextSourceBadge source="persona" />
          </div>
          <p className="text-sm text-neutral-200">
            {(briefing.publico_alvo as string | null) ?? <span className="text-muted-foreground">—</span>}
          </p>
          {Array.isArray(briefing.diferenciais) && (briefing.diferenciais as string[]).length ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Diferenciais</div>
              <div className="flex flex-wrap gap-1.5">
                {(briefing.diferenciais as string[]).map((d, i) => (
                  <Chip key={i}>{d}</Chip>
                ))}
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

// ---------- STRATEGY ----------

export function StrategyTab({ brandId, clientId }: Scope) {
  const { data: core } = useSuspenseQuery(customerCoreQuery({ brandId, clientId }));
  const briefing = (core.briefing?.data ?? {}) as Record<string, unknown>;
  const voice = (core.voice?.data as { voice_card?: { brand_personality?: string; tone_characteristics?: string[]; vocabulary_rules?: { words_to_use?: string[]; words_to_avoid?: string[] }; brand_phrases_examples?: string[] } } | null)?.voice_card;

  const rows: Array<[string, unknown]> = [
    ["Público-alvo", briefing.publico_alvo],
    ["Tom de voz", briefing.tom_de_voz],
    ["Dores do cliente final", briefing.dores_do_cliente_final],
    ["Diferenciais", briefing.diferenciais],
    ["Hashtags sugeridas", briefing.hashtags_sugeridas],
    ["Concorrentes citados", briefing.concorrentes_mencionados],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Briefing estruturado" icon={Target}>
        <div className="mb-3">
          <ContextSourceBadge source="persona" />
        </div>
        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm text-neutral-200">
                {Array.isArray(value) ? (
                  value.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(value as string[]).map((v, i) => (
                        <Chip key={i}>{v}</Chip>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                ) : (
                  (value as string) || <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard title="Voice Card" icon={Sparkles}>
        <div className="mb-3">
          <ContextSourceBadge source="persona" />
        </div>
        {voice ? (
          <div className="space-y-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Brand personality</div>
              <p className="mt-1 text-sm leading-relaxed text-neutral-200">{voice.brand_personality}</p>
            </div>
            {voice.tone_characteristics?.length ? (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tone characteristics</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {voice.tone_characteristics.map((t, i) => (
                    <Chip key={i} tone="info">{t}</Chip>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-300">Palavras a usar</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(voice.vocabulary_rules?.words_to_use ?? []).map((w, i) => (
                    <Chip key={i} tone="success">{w}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-red-300">Palavras a evitar</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(voice.vocabulary_rules?.words_to_avoid ?? []).map((w, i) => (
                    <Chip key={i} tone="danger">{w}</Chip>
                  ))}
                </div>
              </div>
            </div>
            {voice.brand_phrases_examples?.length ? (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Frases-exemplo</div>
                <ul className="mt-1.5 space-y-1.5">
                  {voice.brand_phrases_examples.map((p, i) => (
                    <li key={i} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-neutral-200">
                      “{p}”
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyHint text="Voice card ainda não gerado." />
        )}
      </SectionCard>
    </div>
  );
}

// ---------- TARGET ----------

export function TargetTab({ brandId, clientId }: Scope) {
  const { data: target } = useSuspenseQuery(customerTargetQuery({ brandId, clientId }));
  const personas = normalizePersonas(target.personas?.data);
  const cohorts = normalizeCohorts(target.cohorts?.data);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-neutral-200">
            <Users className="h-4 w-4 text-cyan-400" /> Personas
          </h3>
          <ContextSourceBadge source="persona" />
        </div>
        {personas.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {personas.map((p, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-neutral-950/60 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-indigo-500/30 text-[11px] font-bold text-cyan-100">
                    {p.nome?.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-sm font-semibold">{p.nome}</div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-300">{p.descricao}</p>
                {p.dores?.length ? (
                  <div className="mt-3">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-red-300">Dores</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.dores.slice(0, 4).map((d, j) => (
                        <Chip key={j} tone="danger">{d}</Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
                {p.canais_preferidos?.length ? (
                  <div className="mt-2">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Canais</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.canais_preferidos.map((c, j) => (
                        <Chip key={j}>{c}</Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyHint text="Personas ainda não geradas." />
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-neutral-200">
            <Layers className="h-4 w-4 text-cyan-400" /> Cohorts comportamentais
          </h3>
          <ContextSourceBadge source="persona" />
        </div>
        {cohorts.length ? (
          <div className="space-y-2">
            {cohorts.map((c, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-neutral-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-neutral-100">{c.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.target_personas ?? []).map((tp, j) => (
                      <Chip key={j} tone="info">{tp}</Chip>
                    ))}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Behavioral traits</div>
                    <p className="mt-1 text-neutral-300">{c.behavioral_traits}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Content strategy</div>
                    <p className="mt-1 text-neutral-300">{c.content_strategy}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Conversion criteria</div>
                    <p className="mt-1 text-neutral-300">{c.conversion_criteria}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyHint text="Cohorts ainda não gerados." />
        )}
      </div>
    </div>
  );
}

// ---------- MARKET ----------

export function MarketTab({ brandId, clientId }: Scope) {
  const { data: market } = useSuspenseQuery(customerMarketQuery({ brandId, clientId }));
  const swot = (market.swot?.data as {
    swot_analysis?: { strengths?: string[]; weaknesses?: string[]; opportunities?: string[]; threats?: string[] };
    competitive_matrix?: Array<{ competitor_name: string; our_advantages: string; vulnerabilities: string }>;
  } | null);
  const analysis = swot?.swot_analysis;
  const matrix = swot?.competitive_matrix ?? [];

  const quadrants = [
    { key: "strengths", label: "Strengths", items: analysis?.strengths ?? [], icon: TrendingUp, tone: "border-emerald-500/30 bg-emerald-500/5", accent: "text-emerald-300" },
    { key: "weaknesses", label: "Weaknesses", items: analysis?.weaknesses ?? [], icon: ShieldAlert, tone: "border-amber-500/30 bg-amber-500/5", accent: "text-amber-300" },
    { key: "opportunities", label: "Opportunities", items: analysis?.opportunities ?? [], icon: Zap, tone: "border-cyan-500/30 bg-cyan-500/5", accent: "text-cyan-300" },
    { key: "threats", label: "Threats", items: analysis?.threats ?? [], icon: ShieldAlert, tone: "border-red-500/30 bg-red-500/5", accent: "text-red-300" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ContextSourceBadge source="competitors" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {quadrants.map((q) => (
          <div key={q.key} className={`rounded-xl border p-5 ${q.tone}`}>
            <div className={`flex items-center gap-2 ${q.accent}`}>
              <q.icon className="h-4 w-4" />
              <h4 className="text-sm font-semibold uppercase tracking-wide">{q.label}</h4>
            </div>
            <ul className="mt-3 space-y-1.5">
              {q.items.length ? (
                q.items.map((it, i) => (
                  <li key={i} className="text-xs leading-relaxed text-neutral-200">• {it}</li>
                ))
              ) : (
                <li className="text-xs text-muted-foreground">—</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <SectionCard title="Competitive matrix" icon={ShieldAlert}>
        <div className="mb-3">
          <ContextSourceBadge source="competitors" />
        </div>
        {matrix.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Competitor</th>
                  <th className="py-2 pr-3 font-medium text-emerald-300">Our advantages</th>
                  <th className="py-2 pr-3 font-medium text-red-300">Vulnerabilities</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((c, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-neutral-100">{c.competitor_name}</td>
                    <td className="py-2.5 pr-3 text-neutral-300">{c.our_advantages}</td>
                    <td className="py-2.5 pr-3 text-neutral-300">{c.vulnerabilities}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyHint text="Nenhum concorrente estruturado ainda." />
        )}
      </SectionCard>
    </div>
  );
}

// ---------- TOPICS ----------

export function TopicsTab({ brandId, clientId }: { brandId: string; clientId: string }) {
  const send = useServerFn(sendPautaToContentFn);
  const qc = useQueryClient();

  const pautasQ = useSuspenseQuery(customerPautasQuery({ brandId, clientId }));

  const sendMut = useMutation({
    mutationFn: (pautaId: string) => send({ data: { brandId, clientId, pautaId } }),
    onSuccess: () => {
      toast.success("Enviado ao pipeline de conteúdo");
      qc.invalidateQueries({ queryKey: ["customer-pautas", brandId, clientId] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enviar"),
  });

  const rows = pautasQ.data;

  if (!rows.length) {
    return <EmptyHint text="Nenhuma pauta gerada ainda. Rode o pipeline para popular o backlog." />;
  }

  return (
    <div className="space-y-2">
      {rows.map((p) => {
        const sent = p.status === "sent_to_content";
        return (
          <div
            key={p.id}
            className="flex flex-col gap-3 rounded-xl border border-white/10 bg-neutral-950/60 p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {p.pilar_type ? <Chip tone="info">{p.pilar_type}</Chip> : null}
                {p.plataforma ? <Chip>{p.plataforma}</Chip> : null}
                {p.formato ? <Chip>{p.formato}</Chip> : null}
                {p.cohort_alvo ? <Chip>{p.cohort_alvo}</Chip> : null}
                {sent ? <Chip tone="success">no pipeline</Chip> : null}
              </div>
              <div className="mt-1.5 truncate text-sm font-semibold text-neutral-100">{p.titulo}</div>
              {p.gancho ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.gancho}</div> : null}
            </div>
            <Button
              size="sm"
              variant={sent ? "secondary" : "default"}
              disabled={sent || sendMut.isPending}
              onClick={() => sendMut.mutate(p.id)}
              className="shrink-0 gap-1.5"
            >
              {sent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {sent ? "Enviado" : "Send to Content"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}