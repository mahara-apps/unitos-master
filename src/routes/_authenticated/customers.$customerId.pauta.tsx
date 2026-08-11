import { createFileRoute, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/lib/errors";
import {
  PLAN_CHANNELS,
  PLAN_CHANNEL_LABEL as CHANNEL_LABEL,
  PLAN_FORMATS,
} from "@/lib/monthly-plan-fields";
import {
  approveMonthlyPlanFn,
  createTopicFn,
  deleteTopicFn,
  discardMonthlyPlanFn,
  generateMonthlyPlanFn,
  getMonthlyPlanFn,
  getPlanClientLinkFn,
  getPlanVolumetryFn,
  listBriefingsForPlanFn,
  listMonthlyPlansFn,
  regenerateTopicFn,
  setTopicDecisionFn,
  submitPlanToClientFn,
  undoTopicRegenerationFn,
  updateMonthlyPlanFn,
  updateTopicFn,
  type MonthlyPlanListItem,
  type MonthlyPlanStatus,
  type MonthlyPlanTopic,
  type MonthlyPlanWithTopics,
} from "@/lib/monthly-plans.functions";

const SearchSchema = z.object({ planId: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/customers/$customerId/pauta")({
  validateSearch: (s: Record<string, unknown>) => SearchSchema.parse(s),
  component: MonthlyPlanRoute,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function MonthlyPlanRoute() {
  const { customerId } = Route.useParams();
  const { brandId } = useActiveContext();

  usePageHeader(
    {
      title: "Pauta mensal",
      subtitle: "Planeje os temas do mês antes de produzir os posts",
    },
    [customerId],
  );

  if (!brandId || !UUID_RE.test(brandId) || !UUID_RE.test(customerId)) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Selecione um workspace e cliente.
        </div>
      </div>
    );
  }

  return <MonthlyPlanView brandId={brandId} clientId={customerId} />;
}

/* --------------------------------------------------------------- */

const LOADING_MESSAGES = [
  "Analisando briefing…",
  "Mapeando ganchos estratégicos…",
  "Balanceando formatos de conteúdo…",
  "Escrevendo títulos com personalidade…",
  "Alinhando com o tom de voz da marca…",
  "Finalizando a pauta…",
];

export function MonthlyPlanView({ brandId, clientId }: { brandId: string; clientId: string }) {
  // Route-agnostic: this view is mounted from both
  // /_authenticated/customers/$customerId/pauta and /_authenticated/monthly-plan
  const rawSearch = useSearch({ strict: false }) as { planId?: string };
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const planId = rawSearch.planId ?? null;
  const setPlanId = (id: string | null) =>
    navigate({
      to: pathname,
      search: id ? { planId: id } : {},
      replace: true,
    });
  const [theme, setTheme] = useState("");
  const [briefingId, setBriefingId] = useState<string>("__none");

  const listBriefings = useServerFn(listBriefingsForPlanFn);
  const briefingsQ = useQuery({
    queryKey: ["monthly-plan", "briefings", brandId, clientId],
    queryFn: () => listBriefings({ data: { brandId, clientId } }),
  });

  const listPlans = useServerFn(listMonthlyPlansFn);
  const historyQ = useQuery({
    queryKey: ["monthly-plans", "list", brandId, clientId],
    queryFn: () => listPlans({ data: { brandId, clientId } }),
  });

  const getVolumetry = useServerFn(getPlanVolumetryFn);
  const volumetryQ = useQuery({
    queryKey: ["monthly-plan", "volumetry", clientId],
    queryFn: () => getVolumetry({ data: { clientId } }),
  });
  const volumetry = volumetryQ.data as
    | {
        weekly: Record<string, number>;
        monthlyQuota: Record<string, number>;
        totalTarget: number;
        hasBriefing: boolean;
      }
    | undefined;
  const hasVolumetry = (volumetry?.totalTarget ?? 0) > 0;



  const generate = useServerFn(generateMonthlyPlanFn);
  const [loadingStep, setLoadingStep] = useState(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateM = useMutation({
    mutationFn: (input: { theme: string; briefingId: string | null }) =>
      generate({
        data: {
          brandId,
          clientId,
          theme: input.theme,
          briefingId: input.briefingId ?? undefined,
        },
      }),
    onMutate: () => {
      setLoadingStep(0);
      stepTimer.current = setInterval(() => {
        setLoadingStep((s) => (s + 1) % LOADING_MESSAGES.length);
      }, 1800);
    },
    onSettled: () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
      stepTimer.current = null;
    },
    onSuccess: (res: MonthlyPlanWithTopics) => {
      qc.setQueryData(["monthly-plan", res.plan.id], res);
      qc.invalidateQueries({ queryKey: ["monthly-plans", "list", brandId, clientId] });
      setPlanId(res.plan.id);
    },
    onError: (err) => toast.error(`Falha ao gerar pauta: ${describeError(err)}`),
  });

  const qc = useQueryClient();

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  /* -------- ESTADO 1: geração -------- */
  if (!planId) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl flex-col justify-center px-6 py-16">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-8 backdrop-blur">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Pauta mensal
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Sobre o que vamos falar este mês?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O briefing do cliente é sempre usado como contexto. O tema é opcional —
              a IA distribui as peças conforme a volumetria por canal definida no briefing.
            </p>
          </div>

          {generateM.isPending ? (
            <GenerationSkeleton message={LOADING_MESSAGES[loadingStep]} />
          ) : (
            <div className="space-y-4">
              {/* Volumetria — campo obrigatório */}
              {volumetryQ.isLoading ? (
                <Skeleton className="h-20 w-full rounded-lg" />
              ) : hasVolumetry ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Volumetria do briefing
                  </div>
                  <ul className="grid gap-1 text-sm">
                    {PLAN_CHANNELS.filter((c) => (volumetry?.monthlyQuota[c] ?? 0) > 0).map((c) => (
                      <li key={c} className="flex items-center justify-between">
                        <span>{CHANNEL_LABEL[c]}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {volumetry?.weekly[c] ?? 0}/sem →{" "}
                          <span className="font-medium text-foreground">
                            {volumetry?.monthlyQuota[c] ?? 0}
                          </span>
                          /mês
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    Total:{" "}
                    <span className="font-medium text-foreground">{volumetry?.totalTarget ?? 0}</span>{" "}
                    peças no mês.
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Volumetria não definida.</p>
                    <p className="mt-0.5">
                      Defina quantas peças por semana em cada canal no briefing do cliente
                      (aba Briefing → Metas de publicação) para gerar a pauta.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tema do mês{" "}
                  <span className="normal-case text-muted-foreground/70">(opcional)</span>
                </label>
                <Input
                  autoFocus
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Ex.: Mês das Mães focado em vendas"
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Vincular a um briefing específico (opcional)
                </label>
                <Select value={briefingId} onValueChange={setBriefingId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Nenhum briefing" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Nenhum</SelectItem>
                    {(briefingsQ.data ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="h-11 w-full gap-2 text-base"
                disabled={!hasVolumetry || volumetryQ.isLoading}
                onClick={() =>
                  generateM.mutate({
                    theme: theme.trim(),
                    briefingId: briefingId === "__none" ? null : briefingId,
                  })
                }
              >
                <Sparkles className="h-4 w-4" />
                Gerar Pauta com IA
              </Button>
            </div>
          )}
        </div>

        {!generateM.isPending ? (
          <PlanHistory
            data={historyQ.data ?? []}
            loading={historyQ.isLoading}
            onOpen={(id) => setPlanId(id)}
          />
        ) : null}
      </div>
    );
  }

  /* -------- ESTADO 2: aprovação -------- */
  return (
    <ApprovalView
      planId={planId}
      brandId={brandId}
      clientId={clientId}
      onDiscarded={() => {
        setPlanId(null);
        setTheme("");
        setBriefingId("__none");
        qc.invalidateQueries({ queryKey: ["monthly-plans", "list", brandId, clientId] });
      }}
    />
  );
}

const PLAN_STATUS_META: Record<MonthlyPlanStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  pending_client: {
    label: "No cliente",
    cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
  changes_requested: {
    label: "Ajustes pedidos",
    cls: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  client_approved: {
    label: "Cliente aprovou",
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  approved: {
    label: "Em produção",
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  archived: { label: "Arquivada", cls: "bg-muted text-muted-foreground border-border" },
};

function PlanHistory({
  data,
  loading,
  onOpen,
}: {
  data: MonthlyPlanListItem[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="mt-8 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (data.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Histórico de pautas deste cliente</h2>
        <span className="text-xs text-muted-foreground">{data.length} registros</span>
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
        {data.map((p) => {
          const meta = PLAN_STATUS_META[p.status] ?? PLAN_STATUS_META.draft;
          return (
            <button
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium uppercase tracking-wide ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <span className="truncate text-sm font-medium">{p.title}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {p.author_name ? ` · ${p.author_name}` : ""}
                  {` · ${p.topics_count} tópicos`}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GenerationSkeleton({ message }: { message: string }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="animate-pulse">{message}</span>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- */

function ApprovalView({
  planId,
  brandId,
  clientId,
  onDiscarded,
}: {
  planId: string;
  brandId: string;
  clientId: string;
  onDiscarded: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getPlan = useServerFn(getMonthlyPlanFn);
  const updatePlan = useServerFn(updateMonthlyPlanFn);
  const createTopic = useServerFn(createTopicFn);
  const updateTopic = useServerFn(updateTopicFn);
  const deleteTopic = useServerFn(deleteTopicFn);
  const approvePlan = useServerFn(approveMonthlyPlanFn);
  const discardPlan = useServerFn(discardMonthlyPlanFn);
  const setDecision = useServerFn(setTopicDecisionFn);
  const regenerate = useServerFn(regenerateTopicFn);
  const undoRegen = useServerFn(undoTopicRegenerationFn);
  const submitToClient = useServerFn(submitPlanToClientFn);
  const getLink = useServerFn(getPlanClientLinkFn);

  const q = useQuery({
    queryKey: ["monthly-plan", planId],
    queryFn: () => getPlan({ data: { planId } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["monthly-plan", planId] });
    void qc.invalidateQueries({ queryKey: ["monthly-plans", "list", brandId, clientId] });
  };

  const savePlan = useMutation({
    mutationFn: (patch: { title?: string; description?: string; objectives?: string }) =>
      updatePlan({ data: { planId, ...patch } }),
    onError: (e) => toast.error(`Falha ao salvar: ${describeError(e)}`),
  });

  const addTopic = useMutation({
    mutationFn: () =>
      createTopic({
        data: {
          planId,
          topic_title: "Nova ideia de post",
          content_format: null,
          channel: null,
          angle: "",
        },
      }),
    onSuccess: (t) => {
      qc.setQueryData<MonthlyPlanWithTopics | null>(["monthly-plan", planId], (prev) =>
        prev ? { ...prev, topics: [...prev.topics, t] } : prev,
      );
    },
    onError: (e) => toast.error(`Falha ao adicionar tópico: ${describeError(e)}`),
  });

  const patchTopic = useMutation({
    mutationFn: (input: { topicId: string; patch: Partial<MonthlyPlanTopic> }) =>
      updateTopic({
        data: {
          topicId: input.topicId,
          topic_title: input.patch.topic_title,
          content_format: input.patch.content_format ?? undefined,
          channel: input.patch.channel ?? undefined,
          angle: input.patch.angle ?? undefined,
        },
      }),
    onError: (e) => toast.error(`Falha ao atualizar tópico: ${describeError(e)}`),
  });

  const topicDecision = useMutation({
    mutationFn: (input: { topicId: string; status: "pending" | "approved" | "rejected" }) =>
      setDecision({ data: input }),
    onMutate: (input) => {
      qc.setQueryData<MonthlyPlanWithTopics | null>(["monthly-plan", planId], (p) =>
        p
          ? {
              ...p,
              topics: p.topics.map((t) =>
                t.id === input.topicId ? { ...t, status: input.status } : t,
              ),
            }
          : p,
      );
    },
    onError: (e) => {
      invalidate();
      toast.error(
        describeError(e).includes("topic_incomplete")
          ? "Defina plataforma e formato antes de aprovar."
          : `Falha ao decidir: ${describeError(e)}`,
      );
    },
  });

  const regenM = useMutation({
    mutationFn: (input: { topicId: string; instruction: string }) =>
      regenerate({ data: input }),
    onSuccess: (t) => {
      qc.setQueryData<MonthlyPlanWithTopics | null>(["monthly-plan", planId], (p) =>
        p ? { ...p, topics: p.topics.map((x) => (x.id === t.id ? t : x)) } : p,
      );
      toast.success("Item regenerado.");
    },
    onError: (e) => toast.error(`Falha ao regenerar: ${describeError(e)}`),
  });

  const undoM = useMutation({
    mutationFn: (topicId: string) => undoRegen({ data: { topicId } }),
    onSuccess: (t) => {
      qc.setQueryData<MonthlyPlanWithTopics | null>(["monthly-plan", planId], (p) =>
        p ? { ...p, topics: p.topics.map((x) => (x.id === t.id ? t : x)) } : p,
      );
    },
    onError: (e) => toast.error(`Falha ao desfazer: ${describeError(e)}`),
  });

  const removeTopic = useMutation({
    mutationFn: (topicId: string) => deleteTopic({ data: { topicId } }),
    onMutate: (topicId) => {
      const prev = qc.getQueryData<MonthlyPlanWithTopics | null>(["monthly-plan", planId]);
      qc.setQueryData<MonthlyPlanWithTopics | null>(["monthly-plan", planId], (p) =>
        p ? { ...p, topics: p.topics.filter((t) => t.id !== topicId) } : p,
      );
      return { prev };
    },
    onError: (e, _, ctx) => {
      if (ctx?.prev) qc.setQueryData(["monthly-plan", planId], ctx.prev);
      toast.error(`Falha ao remover: ${describeError(e)}`);
    },
  });

  const submitM = useMutation({
    mutationFn: () => submitToClient({ data: { planId } }),
    onSuccess: (link) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["monthly-plan-link", planId] });
      toast.success("Pauta enviada para aprovação do cliente.", {
        description: "Copie o link de aprovação e envie ao cliente.",
      });
      void navigator.clipboard?.writeText(`${window.location.origin}${link.url}`).catch(() => {});
    },
    onError: (e) => {
      const m = describeError(e);
      toast.error(
        m.includes("topics_pending_decision")
          ? "Ainda há itens sem decisão interna (aprovar ou descartar)."
          : m.includes("topics_incomplete")
            ? "Há itens aprovados sem plataforma ou formato."
            : m.includes("no_approved_topics")
              ? "Aprove ao menos um item antes de enviar ao cliente."
              : `Falha ao enviar: ${m}`,
      );
    },
  });

  const linkQ = useQuery({
    queryKey: ["monthly-plan-link", planId],
    queryFn: () => getLink({ data: { planId } }),
    enabled: q.data?.plan.status === "pending_client" || q.data?.plan.status === "client_approved",
  });

  const approve = useMutation({
    mutationFn: () => approvePlan({ data: { planId, brandId, clientId } }),
    onSuccess: (res) => {
      toast.success(`${res.created} posts criados no Kanban.`);
      navigate({ to: "/content" });
    },
    onError: (e) => {
      const m = describeError(e);
      toast.error(
        m.includes("client_approval_required")
          ? "O cliente precisa aprovar a pauta antes de gerar os cards."
          : `Falha ao aprovar: ${m}`,
      );
    },
  });

  const discard = useMutation({
    mutationFn: () => discardPlan({ data: { planId } }),
    onSuccess: () => {
      toast.success("Pauta descartada.");
      onDiscarded();
    },
    onError: (e) => toast.error(`Falha ao descartar: ${describeError(e)}`),
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-10">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { plan, topics } = q.data;
  const locked = plan.status === "pending_client" || plan.status === "client_approved";
  const approvedTopics = topics.filter((t) => t.status === "approved");
  const pendingTopics = topics.filter((t) => t.status === "pending");
  const incomplete = approvedTopics.filter((t) => !t.channel || !t.content_format);
  const clientLink = linkQ.data ? `${window.location.origin}${linkQ.data.url}` : null;

  return (
    <div className="pb-32">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <StatusBanner
          status={plan.status}
          feedback={plan.client_feedback}
          link={clientLink}
        />

        {/* Estratégia */}
        <section className="space-y-5 rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur">
          <InlineEditable
            as="h1"
            className="text-3xl font-semibold tracking-tight"
            value={plan.title}
            onSave={(v) => savePlan.mutate({ title: v })}
            multiline={false}
            placeholder="Headline da pauta"
          />
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Descrição
              </div>
              <InlineEditable
                as="div"
                className="text-sm text-foreground/90"
                value={plan.description ?? ""}
                onSave={(v) => savePlan.mutate({ description: v })}
                multiline
                placeholder="Contexto do mês…"
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Objetivos
              </div>
              <InlineEditable
                as="div"
                className="whitespace-pre-line text-sm text-foreground/90"
                value={plan.objectives ?? ""}
                onSave={(v) => savePlan.mutate({ objectives: v })}
                multiline
                placeholder="O que esperamos alcançar…"
              />
            </div>
          </div>
        </section>

        {/* Tópicos */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Ideias de posts</h2>
              <p className="text-xs text-muted-foreground">
                {topics.length} itens · {approvedTopics.length} aprovados ·{" "}
                {pendingTopics.length} sem decisão
              </p>
            </div>
            {!locked ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => addTopic.mutate()}
                disabled={addTopic.isPending}
              >
                <Plus className="h-4 w-4" /> Novo tópico
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {topics.map((t) => (
              <TopicCard
                key={t.id}
                topic={t}
                locked={locked}
                regenerating={regenM.isPending && regenM.variables?.topicId === t.id}
                onStatus={(status) => topicDecision.mutate({ topicId: t.id, status })}
                onRegenerate={(instruction) =>
                  regenM.mutate({ topicId: t.id, instruction })
                }
                onUndo={() => undoM.mutate(t.id)}
                onPatch={(patch) => {
                  qc.setQueryData<MonthlyPlanWithTopics | null>(
                    ["monthly-plan", planId],
                    (p) =>
                      p
                        ? {
                            ...p,
                            topics: p.topics.map((x) =>
                              x.id === t.id ? { ...x, ...patch } : x,
                            ),
                          }
                        : p,
                  );
                  patchTopic.mutate({ topicId: t.id, patch });
                }}
                onDelete={() => removeTopic.mutate(t.id)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Button
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => discard.mutate()}
            disabled={discard.isPending}
          >
            <X className="h-4 w-4" /> Descartar pauta
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {clientLink ? (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  void navigator.clipboard?.writeText(clientLink);
                  toast.success("Link de aprovação copiado.");
                }}
              >
                <LinkIcon className="h-4 w-4" /> Copiar link do cliente
              </Button>
            ) : null}

            {plan.status === "client_approved" ? (
              <Button
                className="gap-2"
                onClick={() => approve.mutate()}
                disabled={approve.isPending || approvedTopics.length === 0}
              >
                {approve.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Enviar para produção ({approvedTopics.length})
              </Button>
            ) : (
              <Button
                className="gap-2"
                onClick={() => submitM.mutate()}
                disabled={
                  submitM.isPending ||
                  plan.status === "pending_client" ||
                  approvedTopics.length === 0 ||
                  pendingTopics.length > 0 ||
                  incomplete.length > 0
                }
                title={
                  pendingTopics.length > 0
                    ? "Aprove ou descarte todos os itens"
                    : incomplete.length > 0
                      ? "Há itens aprovados sem plataforma/formato"
                      : undefined
                }
              >
                {submitM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {plan.status === "pending_client"
                  ? "Aguardando cliente"
                  : "Enviar ao cliente para aprovação"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  feedback,
  link,
}: {
  status: MonthlyPlanStatus;
  feedback: string | null;
  link: string | null;
}) {
  if (status === "draft") {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
        Aprovação interna: decida cada item (aprovar/descartar) e defina plataforma e formato.
        Só depois a pauta vai ao cliente — e apenas os itens aprovados pelo cliente viram cards.
      </div>
    );
  }
  if (status === "pending_client") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-400">
        Aguardando aprovação do cliente.{link ? ` Link: ${link}` : ""}
      </div>
    );
  }
  if (status === "changes_requested") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-400">
        <p className="font-medium">O cliente pediu ajustes.</p>
        {feedback ? <p className="mt-1 text-muted-foreground">{feedback}</p> : null}
        <p className="mt-1">Ajuste os itens e envie novamente para aprovação.</p>
      </div>
    );
  }
  if (status === "client_approved") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-400">
        Cliente aprovou a pauta. Envie para produção para criar os cards no Kanban.
      </div>
    );
  }
  if (status === "approved") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-400">
        Pauta já enviada para produção.
      </div>
    );
  }
  return null;
}

/* --------------------------------------------------------------- */

function TopicCard({
  topic,
  onPatch,
  onDelete,
  onStatus,
  onRegenerate,
  onUndo,
  regenerating,
  locked,
}: {
  topic: MonthlyPlanTopic;
  onPatch: (p: Partial<MonthlyPlanTopic>) => void;
  onDelete: () => void;
  onStatus: (s: "pending" | "approved" | "rejected") => void;
  onRegenerate: (instruction: string) => void;
  onUndo: () => void;
  regenerating: boolean;
  locked: boolean;
}) {
  const [instrOpen, setInstrOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const complete = !!(topic.channel && topic.content_format);
  const missing = !complete;

  return (
    <div
      className={`group relative rounded-xl border p-4 transition ${
        topic.status === "approved"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : topic.status === "rejected"
            ? "border-border/40 bg-muted/30 opacity-70"
            : "border-border/60 bg-card/40 hover:border-border"
      }`}
    >
      {!locked ? (
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          aria-label="Remover tópico"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <InlineEditable
        as="div"
        className="pr-6 text-sm font-semibold text-foreground"
        value={topic.topic_title}
        onSave={(v) => onPatch({ topic_title: v })}
        multiline={false}
        placeholder="Título do post"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={topic.channel ?? ""}
          onValueChange={(v) => onPatch({ channel: v })}
        >
          <SelectTrigger
            className={`h-7 w-fit gap-1 bg-background/60 px-2 text-xs ${
              topic.channel ? "border-border/60" : "border-amber-500/50 text-amber-500"
            }`}
          >
            <SelectValue placeholder="Plataforma *" />
          </SelectTrigger>
          <SelectContent>
            {PLAN_CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABEL[c] ?? c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={topic.content_format ?? ""}
          onValueChange={(v) => onPatch({ content_format: v })}
        >
          <SelectTrigger
            className={`h-7 w-fit gap-1 bg-background/60 px-2 text-xs ${
              topic.content_format ? "border-border/60" : "border-amber-500/50 text-amber-500"
            }`}
          >
            <SelectValue placeholder="Formato *" />
          </SelectTrigger>
          <SelectContent>
            {PLAN_FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {missing ? (
        <p className="mt-2 text-[11px] text-amber-500">
          Defina plataforma e formato para aprovar este item.
        </p>
      ) : null}
      <div className="mt-3">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Gancho
        </div>
        <InlineEditable
          as="div"
          className="text-xs leading-relaxed text-muted-foreground"
          value={topic.angle ?? ""}
          onSave={(v) => onPatch({ angle: v })}
          multiline
          placeholder="Gancho estratégico / direcionamento…"
        />
      </div>

      {!locked ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
            <Button
              size="sm"
              variant={topic.status === "approved" ? "default" : "outline"}
              className="h-7 gap-1 px-2 text-xs"
              disabled={missing}
              title={missing ? "Defina plataforma e formato" : undefined}
              onClick={() => onStatus(topic.status === "approved" ? "pending" : "approved")}
            >
              <Check className="h-3.5 w-3.5" /> Aprovar
            </Button>
            <Button
              size="sm"
              variant={topic.status === "rejected" ? "secondary" : "ghost"}
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => onStatus(topic.status === "rejected" ? "pending" : "rejected")}
            >
              <X className="h-3.5 w-3.5" /> Descartar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={regenerating}
              onClick={() => setInstrOpen((v) => !v)}
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Regenerar
            </Button>
            {topic.previous_title ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={onUndo}
              >
                <Undo2 className="h-3.5 w-3.5" /> Desfazer
              </Button>
            ) : null}
          </div>

          {instrOpen ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="O que ajustar? (opcional) — plataforma e formato serão mantidos"
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={regenerating}
                  onClick={() => {
                    onRegenerate(instruction.trim());
                    setInstrOpen(false);
                    setInstruction("");
                  }}
                >
                  Gerar nova versão
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setInstrOpen(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- */

function InlineEditable({
  value,
  onSave,
  multiline,
  className,
  placeholder,
  as = "div",
}: {
  value: string;
  onSave: (v: string) => void;
  multiline: boolean;
  className?: string;
  placeholder?: string;
  as?: "div" | "h1";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? "").trim()) onSave(next);
  };

  if (editing) {
    return multiline ? (
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        rows={3}
        className={className}
      />
    ) : (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if (e.key === "Enter") commit();
        }}
        className={className}
      />
    );
  }

  const Tag = as;
  const isEmpty = !value || !value.trim();
  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`${className ?? ""} -mx-1 cursor-text rounded px-1 transition hover:bg-muted/40 ${
        isEmpty ? "text-muted-foreground/60 italic" : ""
      }`}
    >
      {isEmpty ? placeholder ?? "Clique para editar" : value}
    </Tag>
  );
}