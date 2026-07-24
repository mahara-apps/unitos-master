import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
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
  approveMonthlyPlanFn,
  createTopicFn,
  deleteTopicFn,
  discardMonthlyPlanFn,
  generateMonthlyPlanFn,
  getMonthlyPlanFn,
  listBriefingsForPlanFn,
  updateMonthlyPlanFn,
  updateTopicFn,
  type MonthlyPlanTopic,
  type MonthlyPlanWithTopics,
} from "@/lib/monthly-plans.functions";

export const Route = createFileRoute("/_authenticated/customers/$customerId/pauta")({
  component: MonthlyPlanRoute,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function MonthlyPlanRoute() {
  const { customerId } = Route.useParams();
  const { brandId } = useActiveContext();

  usePageHeader(
    {
      title: "Pauta mensal",
      subtitle: "Briefing → Pauta → Aprovação → Produção",
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

function MonthlyPlanView({ brandId, clientId }: { brandId: string; clientId: string }) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [theme, setTheme] = useState("");
  const [briefingId, setBriefingId] = useState<string>("__none");

  const listBriefings = useServerFn(listBriefingsForPlanFn);
  const briefingsQ = useQuery({
    queryKey: ["monthly-plan", "briefings", brandId, clientId],
    queryFn: () => listBriefings({ data: { brandId, clientId } }),
  });

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
      setPlanId(res.plan.id);
      qc.setQueryData(["monthly-plan", res.plan.id], res);
    },
    onError: (err) => toast.error(describeError(err, "Falha ao gerar pauta")),
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
              Descreva o tema estratégico e, se quiser, ancore em um briefing existente.
              A IA cria a pauta completa com ganchos, formatos e objetivos.
            </p>
          </div>

          {generateM.isPending ? (
            <GenerationSkeleton message={LOADING_MESSAGES[loadingStep]} />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tema do mês
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
                  Vincular a um briefing (opcional)
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
                disabled={theme.trim().length < 3}
                onClick={() =>
                  generateM.mutate({
                    theme: theme.trim(),
                    briefingId: briefingId === "__none" ? null : briefingId,
                  })
                }
              >
                <Sparkles className="h-4 w-4" /> Gerar Pauta com IA
              </Button>
            </div>
          )}
        </div>
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
      }}
    />
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

  const q = useQuery({
    queryKey: ["monthly-plan", planId],
    queryFn: () => getPlan({ data: { planId } }),
  });

  const savePlan = useMutation({
    mutationFn: (patch: { title?: string; description?: string; objectives?: string }) =>
      updatePlan({ data: { planId, ...patch } }),
    onError: (e) => toast.error(describeError(e, "Falha ao salvar")),
  });

  const addTopic = useMutation({
    mutationFn: () =>
      createTopic({
        data: {
          planId,
          topic_title: "Nova ideia de post",
          content_format: "Post",
          angle: "",
        },
      }),
    onSuccess: (t) => {
      qc.setQueryData<MonthlyPlanWithTopics | null>(["monthly-plan", planId], (prev) =>
        prev ? { ...prev, topics: [...prev.topics, t] } : prev,
      );
    },
    onError: (e) => toast.error(describeError(e, "Falha ao adicionar tópico")),
  });

  const patchTopic = useMutation({
    mutationFn: (input: { topicId: string; patch: Partial<MonthlyPlanTopic> }) =>
      updateTopic({
        data: {
          topicId: input.topicId,
          topic_title: input.patch.topic_title,
          content_format: input.patch.content_format ?? undefined,
          angle: input.patch.angle ?? undefined,
        },
      }),
    onError: (e) => toast.error(describeError(e, "Falha ao atualizar tópico")),
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
      toast.error(describeError(e, "Falha ao remover"));
    },
  });

  const approve = useMutation({
    mutationFn: () => approvePlan({ data: { planId, brandId, clientId } }),
    onSuccess: (res) => {
      toast.success(`${res.created} posts criados no Kanban.`);
      navigate({ to: "/content" });
    },
    onError: (e) => toast.error(describeError(e, "Falha ao aprovar")),
  });

  const discard = useMutation({
    mutationFn: () => discardPlan({ data: { planId } }),
    onSuccess: () => {
      toast.success("Pauta descartada.");
      onDiscarded();
    },
    onError: (e) => toast.error(describeError(e, "Falha ao descartar")),
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

  return (
    <div className="pb-32">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
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
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">Ideias de posts</h2>
              <p className="text-xs text-muted-foreground">
                {topics.length} tópicos · edite, remova ou adicione manualmente.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => addTopic.mutate()}
              disabled={addTopic.isPending}
            >
              <Plus className="h-4 w-4" /> Novo tópico
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {topics.map((t) => (
              <TopicCard
                key={t.id}
                topic={t}
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
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
          <Button
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => discard.mutate()}
            disabled={discard.isPending}
          >
            <X className="h-4 w-4" /> Descartar pauta
          </Button>
          <Button
            className="gap-2"
            onClick={() => approve.mutate()}
            disabled={approve.isPending || topics.length === 0}
          >
            {approve.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Aprovar pauta e enviar para produção
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- */

function TopicCard({
  topic,
  onPatch,
  onDelete,
}: {
  topic: MonthlyPlanTopic;
  onPatch: (p: Partial<MonthlyPlanTopic>) => void;
  onDelete: () => void;
}) {
  const FORMATS = ["Reels", "Carrossel", "Storie", "Post estático", "Vídeo curto"];
  return (
    <div className="group relative rounded-xl border border-border/60 bg-card/40 p-4 transition hover:border-border">
      <button
        onClick={onDelete}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label="Remover tópico"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <InlineEditable
        as="div"
        className="pr-6 text-sm font-semibold text-foreground"
        value={topic.topic_title}
        onSave={(v) => onPatch({ topic_title: v })}
        multiline={false}
        placeholder="Título do post"
      />
      <div className="mt-3 flex items-center gap-2">
        <Select
          value={topic.content_format ?? "Post"}
          onValueChange={(v) => onPatch({ content_format: v })}
        >
          <SelectTrigger className="h-7 w-fit gap-1 border-border/60 bg-background/60 px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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