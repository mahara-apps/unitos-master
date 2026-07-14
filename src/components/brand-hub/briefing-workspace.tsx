import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  FileUp,
  ImageIcon,
  Loader2,
  Lightbulb,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  getBrandHub,
  updateBrandHub,
  uploadBrandAsset,
  updateBrandVisuals,
  type BrandHubClient,
  type BrandHubData,
} from "@/lib/brand-hub.functions";
import { computeBriefingCompletion, briefingProgressLabel } from "@/lib/briefing-progress";
import { supabase } from "@/integrations/supabase/client";

/* ----------------------------- Types / helpers ----------------------------- */

type SocialKey = "instagram" | "tiktok" | "linkedin" | "youtube" | "facebook";

type FormState = {
  // Identidade
  tone_text: string;
  mission: string;
  positioning: string;
  values: string;
  // Produto
  offer: string;
  price_range: string;
  differentials: string;
  objections: string;
  // Público
  audience: string;
  journey: string;
  pain_points: string;
  desires: string;
  // Concorrentes
  competitor_handles: string[];
  inspirations: string[];
  // Hashtags & Estética
  hashtags: string[];
  palette: Array<{ label: string; hex: string }>;
  do_text: string;
  dont_text: string;
  // Volumetria & Metas
  volumetry: Record<SocialKey, number>;
  goals: string;
};

const SOCIALS: Array<{ key: SocialKey; label: string }> = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
];

const TABS = [
  { value: "identidade", label: "Identidade" },
  { value: "produto", label: "Produto" },
  { value: "publico", label: "Público" },
  { value: "concorrentes", label: "Concorrentes" },
  { value: "hashtags", label: "Hashtags & Estética" },
  { value: "volumetria", label: "Volumetria & Metas" },
] as const;

function toForm(client: BrandHubClient): FormState {
  const hub = client.brand_hub ?? {};
  return {
    tone_text: hub.tone_text ?? client.tone_of_voice ?? "",
    mission: hub.mission ?? "",
    positioning: hub.positioning ?? "",
    values: hub.values ?? "",
    offer: hub.offer ?? "",
    price_range: hub.price_range ?? "",
    differentials: hub.differentials ?? "",
    objections: hub.objections ?? "",
    audience: hub.audience ?? "",
    journey: hub.journey ?? "",
    pain_points: hub.pain_points ?? "",
    desires: hub.desires ?? "",
    competitor_handles: (hub.competitors ?? []).map((c) => c.handle),
    inspirations: hub.inspirations ?? [],
    hashtags: hub.hashtags ?? [],
    palette: hub.palette ?? [],
    do_text: hub.do_dont?.do ?? "",
    dont_text: hub.do_dont?.dont ?? "",
    volumetry: {
      instagram: hub.volumetry?.instagram ?? 0,
      tiktok: hub.volumetry?.tiktok ?? 0,
      linkedin: hub.volumetry?.linkedin ?? 0,
      youtube: hub.volumetry?.youtube ?? 0,
      facebook: hub.volumetry?.facebook ?? 0,
    },
    goals: hub.goals ?? "",
  };
}

function computeCompletion(f: FormState): number {
  // Mirror the FormState back to a BrandHubData-like shape so the checklist
  // shared with the dashboard stays the single source of truth.
  return computeBriefingCompletion({
    tone_text: f.tone_text,
    mission: f.mission,
    positioning: f.positioning,
    values: f.values,
    offer: f.offer,
    price_range: f.price_range,
    differentials: f.differentials,
    objections: f.objections,
    audience: f.audience,
    journey: f.journey,
    pain_points: f.pain_points,
    desires: f.desires,
    competitors: f.competitor_handles.map((h) => ({
      id: h,
      handle: h,
      platform: "instagram",
      added_at: "",
    })),
    inspirations: f.inspirations,
    hashtags: f.hashtags,
    palette: f.palette,
    do_dont: { do: f.do_text, dont: f.dont_text },
    volumetry: f.volumetry,
    goals: f.goals,
  });
}

const progressLabel = briefingProgressLabel;

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

/* ------------------------------- Component -------------------------------- */

export function BriefingWorkspace({
  brandId,
  clientId,
  embedded = false,
  onStrategyGenerated,
}: {
  brandId: string;
  clientId: string;
  embedded?: boolean;
  onStrategyGenerated?: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchHub = useServerFn(getBrandHub);
  const saveHub = useServerFn(updateBrandHub);

  const hubQ = useQuery({
    queryKey: ["brand-hub", brandId, clientId],
    queryFn: () => fetchHub({ data: { brandId, clientId } }),
  });

  const [form, setForm] = useState<FormState | null>(null);
  useEffect(() => {
    if (hubQ.data && !form) setForm(toForm(hubQ.data));
  }, [hubQ.data, form]);

  const completion = useMemo(() => (form ? computeCompletion(form) : 0), [form]);

  // ------------- Gerar estratégia (fase 1 · pipeline de agentes) --------------
  const [regenOpen, setRegenOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ------------- Gerar ideias (fase 2 · gate humano) --------------
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [ideasQty, setIdeasQty] = useState(8);
  const [ideasPeriod, setIdeasPeriod] = useState("próximos 15 dias");
  const [genIdeas, setGenIdeas] = useState(false);

  // Strategy artifacts gate — enable "Gerar ideias" only when all four exist.
  const strategyQ = useQuery({
    queryKey: ["strategy-gate", brandId, clientId],
    queryFn: async () => {
      const [v, p, c, s] = await Promise.all([
        supabase.from("brand_voice_cards").select("id").eq("brand_id", brandId).eq("client_id", clientId).eq("is_active", true).maybeSingle(),
        supabase.from("brand_personas").select("id").eq("brand_id", brandId).eq("client_id", clientId).eq("is_active", true).maybeSingle(),
        supabase.from("brand_cohorts").select("id").eq("brand_id", brandId).eq("client_id", clientId).eq("is_active", true).maybeSingle(),
        supabase.from("brand_swot").select("id").eq("brand_id", brandId).eq("client_id", clientId).eq("is_active", true).maybeSingle(),
      ]);
      return { voice: !!v.data, personas: !!p.data, cohorts: !!c.data, swot: !!s.data };
    },
    refetchOnWindowFocus: true,
  });
  const strategyReady =
    !!strategyQ.data && strategyQ.data.voice && strategyQ.data.personas && strategyQ.data.cohorts && strategyQ.data.swot;

  const runIdeas = async () => {
    setGenIdeas(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/jobs/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brandId, clientId, quantidade: ideasQty, periodo: ideasPeriod }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Gerando ideias em segundo plano — acompanhe pelo indicador de IA.");
      qc.invalidateQueries({ queryKey: ["ai-jobs", "active"] });
      setIdeasOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar ideias");
    } finally {
      setGenIdeas(false);
    }
  };

  const buildStrategyBriefing = (): string => {
    if (!form) return "";
    const lines: string[] = [];
    const push = (label: string, value?: string | null) => {
      const v = (value ?? "").trim();
      if (v) lines.push(`${label}: ${v}`);
    };
    push("Marca", hubQ.data?.name);
    push("Nicho", hubQ.data?.niche);
    push("Missão", form.mission);
    push("Posicionamento", form.positioning);
    push("Valores", form.values);
    push("Tom de voz", form.tone_text);
    push("Oferta / produtos", form.offer);
    push("Faixa de preço", form.price_range);
    push("Diferenciais", form.differentials);
    push("Objeções", form.objections);
    push("Público", form.audience);
    push("Jornada", form.journey);
    push("Dores", form.pain_points);
    push("Desejos", form.desires);
    push("Concorrentes / referências", form.competitor_handles.join(", "));
    push("Inspirações", form.inspirations.join(", "));
    push("Hashtags", form.hashtags.join(" "));
    push("Do", form.do_text);
    push("Don't", form.dont_text);
    push("Metas", form.goals);
    const vol = Object.entries(form.volumetry)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}: ${n}/sem`)
      .join(", ");
    push("Volumetria semanal", vol);
    return lines.join("\n");
  };

  const runStrategy = async () => {
    const briefing = buildStrategyBriefing();
    if (briefing.length < 40) {
      toast.error("Preencha o briefing antes de gerar a estratégia.");
      return;
    }
    setGenerating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/jobs/customer-pipeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId,
          clientId,
          texto: briefing,
          pautasQuantidade: 8,
          pautasPeriodo: "próximos 15 dias",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Estratégia rodando em segundo plano — acompanhe pelo indicador de IA no topo.");
      qc.invalidateQueries({ queryKey: ["ai-jobs", "active"] });
      qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });
      setRegenOpen(false);
      onStrategyGenerated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a estratégia");
    } finally {
      setGenerating(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const existing = hubQ.data?.brand_hub?.competitors ?? [];
      const byHandle = new Map(
        existing.map((c) => [c.handle.replace(/^@/, "").toLowerCase(), c]),
      );
      const competitors = form.competitor_handles.map((raw) => {
        const handle = raw.replace(/^@/, "");
        const prev = byHandle.get(handle.toLowerCase());
        return (
          prev ?? {
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            handle,
            platform: "instagram" as const,
            added_at: new Date().toISOString(),
          }
        );
      });
      return saveHub({
        data: {
          brandId,
          clientId,
          patch: {
            tone_text: form.tone_text,
            mission: form.mission,
            positioning: form.positioning,
            values: form.values,
            offer: form.offer,
            price_range: form.price_range,
            differentials: form.differentials,
            objections: form.objections,
            audience: form.audience,
            journey: form.journey,
            pain_points: form.pain_points,
            desires: form.desires,
            inspirations: form.inspirations,
            hashtags: form.hashtags,
            palette: form.palette,
            do_dont: { do: form.do_text, dont: form.dont_text },
            volumetry: form.volumetry,
            goals: form.goals,
            competitors,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Briefing salvo");
      qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar"),
  });

  const importFromText = () => {
    const raw = window.prompt(
      "Cole aqui o texto do briefing (ou conteúdo extraído de um .docx). O conteúdo será inserido no campo Posicionamento.",
    );
    if (raw && form) {
      setForm({ ...form, positioning: (form.positioning + "\n\n" + raw).trim() });
      toast.success("Texto importado — revise antes de salvar");
    }
  };

  if (hubQ.isLoading || !form || !hubQ.data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const client = hubQ.data;

  const saveButtonClass =
    "gap-1.5 bg-rose-600 text-white hover:bg-rose-700 border-rose-600";

  const body = (
    <>
      <div className={embedded ? "space-y-6 pb-24" : "mx-auto w-full max-w-6xl space-y-6 px-6 py-6 md:px-8 pb-24"}>
        {!embedded && (
          <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5"
              onClick={() =>
                navigate({ to: "/customers/$customerId", params: { customerId: clientId } })
              }
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Button>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                briefing · workspace
              </div>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
                Briefing — {client.name}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Identidade, público, hashtags, concorrentes e volumetria — base para a estratégia.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={importFromText}>
              <FileUp className="h-3.5 w-3.5" /> Importar de .docx / texto
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10 hover:text-fuchsia-200"
              onClick={() => setRegenOpen(true)}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Gerar estratégia
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-50"
              onClick={() => setIdeasOpen(true)}
              disabled={!strategyReady || genIdeas}
              title={strategyReady ? "Gerar ideias de conteúdo" : "Gere e revise a estratégia primeiro"}
            >
              {genIdeas ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lightbulb className="h-3.5 w-3.5" />
              )}
              Gerar ideias
            </Button>
            <Button
              size="sm"
              className={saveButtonClass}
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar briefing
            </Button>
          </div>
          </header>
        )}

        {/* Completion banner */}
        <Alert className="border-rose-500/30 bg-rose-500/5">
          <AlertDescription className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-foreground">
                {progressLabel(completion)} — {completion}% preenchido
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 font-mono text-[10px] text-rose-300">
                  {completion}%
                </Badge>
                <Button
                  size="sm"
                  className="gap-1.5 border-0 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-500 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setRegenOpen(true)}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Gerar estratégia com IA
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-50"
                  onClick={() => setIdeasOpen(true)}
                  disabled={!strategyReady || genIdeas}
                  title={strategyReady ? "Gerar ideias de conteúdo" : "Revise a estratégia primeiro"}
                >
                  {genIdeas ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Lightbulb className="h-3.5 w-3.5" />
                  )}
                  Gerar ideias
                </Button>
              </div>
            </div>
            <Progress value={completion} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Preencha as abas abaixo e depois clique em <b>Gerar estratégia com IA</b> — os agentes
              vão destilar tom de voz, personas, cohorts, SWOT e pautas a partir do que estiver aqui.
            </p>
          </AlertDescription>
        </Alert>

        {/* Tabs */}
        <Tabs defaultValue="identidade" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto rounded-lg border border-border bg-card p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="identidade">
            <IdentidadeTab
              brandId={brandId}
              clientId={clientId}
              client={client}
              form={form}
              setForm={setForm}
            />
          </TabsContent>
          <TabsContent value="produto">
            <ProdutoTab form={form} setForm={setForm} />
          </TabsContent>
          <TabsContent value="publico">
            <PublicoTab form={form} setForm={setForm} />
          </TabsContent>
          <TabsContent value="concorrentes">
            <ConcorrentesTab form={form} setForm={setForm} />
          </TabsContent>
          <TabsContent value="hashtags">
            <HashtagsTab form={form} setForm={setForm} />
          </TabsContent>
          <TabsContent value="volumetria">
            <VolumetriaTab form={form} setForm={setForm} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 left-0 right-0 z-10 border-t border-border/60 bg-background/95 backdrop-blur">
        <div className={embedded ? "flex items-center justify-between gap-4 px-1 py-3" : "mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 md:px-8"}>
          <p className="text-xs text-muted-foreground">
            As alterações são salvas apenas quando você clica em <b>Salvar briefing</b>.
          </p>
          <Button
            size="sm"
            className={saveButtonClass}
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Salvar briefing
          </Button>
        </div>
      </div>

      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar estratégia com IA?</AlertDialogTitle>
            <AlertDialogDescription>
              Os agentes vão ler os campos deste briefing e gerar <b>Voice Card</b>,
              <b> Personas</b>, <b>Cohorts</b>, <b>SWOT</b> e um lote de <b>pautas</b> no pipeline.
              Artefatos anteriores permanecem no histórico — os novos passam a ser a versão ativa.
              O processo roda em segundo plano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runStrategy();
              }}
              disabled={generating}
            >
              {generating ? "Iniciando…" : "Gerar estratégia"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={ideasOpen} onOpenChange={setIdeasOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar ideias de conteúdo</DialogTitle>
            <DialogDescription>
              As pautas serão criadas a partir da estratégia revisada (voice, personas, cohorts e SWOT)
              e injetadas no pipeline como ideias aguardando aprovação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ideas-qty">Quantidade de ideias</Label>
              <Input
                id="ideas-qty"
                type="number"
                min={1}
                max={20}
                value={ideasQty}
                onChange={(e) => setIdeasQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ideas-period">Período</Label>
              <Input
                id="ideas-period"
                value={ideasPeriod}
                onChange={(e) => setIdeasPeriod(e.target.value)}
                placeholder="próximos 15 dias"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIdeasOpen(false)} disabled={genIdeas}>
              Cancelar
            </Button>
            <Button onClick={runIdeas} disabled={genIdeas} className="gap-1.5">
              {genIdeas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
              {genIdeas ? "Iniciando…" : "Gerar ideias"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return <div className="relative">{body}</div>;
  return <ScrollArea className="h-[calc(100vh-3.5rem)] bg-background">{body}</ScrollArea>;
}

/* --------------------------------- Tabs ----------------------------------- */

function SectionCard({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "rounded-xl border border-border bg-card p-5 " + (className ?? "")
      }
    >
      <header className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="resize-y bg-background text-sm"
      />
    </div>
  );
}

/* --- Identidade --- */

function IdentidadeTab({
  brandId,
  clientId,
  client,
  form,
  setForm,
}: {
  brandId: string;
  clientId: string;
  client: BrandHubClient;
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AssetSlot
        brandId={brandId}
        clientId={clientId}
        kind="logo"
        label="Logo principal"
        hint="PNG ou SVG, transparente, até 5 MB"
        currentUrl={client.logo_url}
      />
      <AssetSlot
        brandId={brandId}
        clientId={clientId}
        kind="logo_secondary"
        label="Logo alternativo"
        hint="Versão alt / mono"
        currentUrl={client.logo_secondary_url}
      />
      <AssetSlot
        brandId={brandId}
        clientId={clientId}
        kind="favicon"
        label="Ícone / avatar"
        hint="ICO/PNG 32-256 px"
        currentUrl={client.favicon_url}
      />

      <SectionCard
        title="Identidade da marca"
        hint="Alimenta o motor de voz e briefing da IA."
        className="lg:col-span-3"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Nome
            </Label>
            <Input value={client.name} disabled className="bg-background/60" />
          </div>
          <LabeledTextarea
            label="Tom de voz"
            rows={3}
            value={form.tone_text}
            onChange={(v) => setForm({ ...form, tone_text: v })}
            placeholder="Ex.: consultivo, direto, com humor sutil."
          />
          <LabeledTextarea
            label="Missão"
            value={form.mission}
            onChange={(v) => setForm({ ...form, mission: v })}
            placeholder="Qual o propósito da marca?"
          />
          <LabeledTextarea
            label="Posicionamento"
            value={form.positioning}
            onChange={(v) => setForm({ ...form, positioning: v })}
            placeholder="Como a marca quer ser percebida no mercado?"
          />
          <LabeledTextarea
            label="Valores"
            rows={4}
            value={form.values}
            onChange={(v) => setForm({ ...form, values: v })}
            placeholder="Liste os valores principais (um por linha)."
          />
        </div>
      </SectionCard>
    </div>
  );
}

function AssetSlot({
  brandId,
  clientId,
  kind,
  label,
  hint,
  currentUrl,
}: {
  brandId: string;
  clientId: string;
  kind: "logo" | "logo_secondary" | "favicon";
  label: string;
  hint: string;
  currentUrl: string | null;
}) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadBrandAsset);
  const clear = useServerFn(updateBrandVisuals);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast.error("Arquivo deve ter até 5 MB");
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      await upload({
        data: {
          brandId,
          clientId,
          kind,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
        },
      });
      toast.success(`${label} enviado`);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async () => {
    const col =
      kind === "logo" ? "logo_url" : kind === "favicon" ? "favicon_url" : "logo_secondary_url";
    await clear({ data: { brandId, clientId, patch: { [col]: null } as never } });
    toast.success(`${label} removido`);
    invalidate();
  };

  return (
    <div
      className={
        "flex flex-col rounded-xl border p-4 transition " +
        (dragging ? "border-primary bg-primary/5" : "border-border bg-card")
      }
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f);
      }}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
        {currentUrl ? (
          <Button size="icon" variant="ghost" onClick={removeAsset} title="Remover">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        ) : null}
      </div>
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-background">
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : currentUrl ? (
          <img src={currentUrl} alt={label} className="max-h-28 max-w-full object-contain" />
        ) : (
          <div className="px-4 text-center text-[11px] text-muted-foreground">
            <ImageIcon className="mx-auto mb-1 h-5 w-5" />
            Arraste um arquivo ou clique para enviar
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="h-3.5 w-3.5" /> Enviar
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/* --- Produto / Público --- */

function ProdutoTab({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <SectionCard title="Produto e oferta" hint="Detalhe o que a marca vende e como se diferencia.">
      <div className="grid gap-4">
        <LabeledTextarea
          label="Oferta principal"
          rows={4}
          value={form.offer}
          onChange={(v) => setForm({ ...form, offer: v })}
          placeholder="Produto/serviço principal e seus benefícios centrais."
        />
        <LabeledTextarea
          label="Faixa de preço"
          rows={2}
          value={form.price_range}
          onChange={(v) => setForm({ ...form, price_range: v })}
          placeholder="Ex.: R$ 3.000 a R$ 12.000 / mês."
        />
        <LabeledTextarea
          label="Diferenciais"
          rows={4}
          value={form.differentials}
          onChange={(v) => setForm({ ...form, differentials: v })}
          placeholder="Por que escolher essa marca e não a concorrência?"
        />
        <LabeledTextarea
          label="Objeções comuns"
          rows={4}
          value={form.objections}
          onChange={(v) => setForm({ ...form, objections: v })}
          placeholder="Principais objeções, dúvidas e barreiras de compra."
        />
      </div>
    </SectionCard>
  );
}

function PublicoTab({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <SectionCard title="Público-alvo" hint="Quem compra, o que sente e como decide.">
      <div className="grid gap-4">
        <LabeledTextarea
          label="Descrição do público"
          rows={4}
          value={form.audience}
          onChange={(v) => setForm({ ...form, audience: v })}
          placeholder="Perfil demográfico e comportamental do público ideal."
        />
        <LabeledTextarea
          label="Jornada do cliente"
          rows={4}
          value={form.journey}
          onChange={(v) => setForm({ ...form, journey: v })}
          placeholder="Como descobre, considera, decide e se relaciona depois da compra?"
        />
        <LabeledTextarea
          label="Dores"
          rows={3}
          value={form.pain_points}
          onChange={(v) => setForm({ ...form, pain_points: v })}
          placeholder="Principais frustrações e problemas que a marca resolve."
        />
        <LabeledTextarea
          label="Desejos"
          rows={3}
          value={form.desires}
          onChange={(v) => setForm({ ...form, desires: v })}
          placeholder="O que o público aspira ao contratar a marca."
        />
      </div>
    </SectionCard>
  );
}

/* --- Concorrentes / Hashtags --- */

function ChipListEditor({
  label,
  placeholder,
  values,
  onChange,
  normalize,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
  normalize?: (v: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = (normalize ? normalize(draft) : draft).trim();
    if (!v) return;
    if (values.includes(v)) return setDraft("");
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="bg-background"
        />
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {values.map((v) => (
            <Badge
              key={v}
              variant="outline"
              className="gap-1 border-border bg-background/60 pl-2 pr-1 text-xs"
            >
              <span className="max-w-[220px] truncate">{v}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded-sm p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ConcorrentesTab({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Concorrentes" hint="@handles ou nomes para monitoramento.">
        <ChipListEditor
          label="@handles ou nomes"
          placeholder="@marca_concorrente"
          values={form.competitor_handles}
          onChange={(v) => setForm({ ...form, competitor_handles: v })}
          normalize={(v) => v.replace(/^@/, "")}
        />
      </SectionCard>
      <SectionCard title="Inspirações" hint="URLs de referências criativas e visuais.">
        <ChipListEditor
          label="Referências de inspiração"
          placeholder="https://…"
          values={form.inspirations}
          onChange={(v) => setForm({ ...form, inspirations: v })}
        />
      </SectionCard>
    </div>
  );
}

function HashtagsTab({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Hashtags estratégicas" hint="Use uma por linha ou separe com Enter.">
        <ChipListEditor
          label="Hashtags"
          placeholder="#marca"
          values={form.hashtags}
          onChange={(v) => setForm({ ...form, hashtags: v })}
          normalize={(v) => (v.startsWith("#") ? v : `#${v.replace(/\s+/g, "")}`)}
        />
      </SectionCard>

      <SectionCard title="Paleta & diretrizes visuais" hint="Cores da marca em HEX.">
        <div className="space-y-3">
          {form.palette.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-2"
            >
              <input
                type="color"
                value={c.hex}
                onChange={(e) =>
                  setForm({
                    ...form,
                    palette: form.palette.map((x, j) =>
                      i === j ? { ...x, hex: e.target.value } : x,
                    ),
                  })
                }
                className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <Input
                value={c.label}
                onChange={(e) =>
                  setForm({
                    ...form,
                    palette: form.palette.map((x, j) =>
                      i === j ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
                placeholder="Rótulo"
                className="h-8 bg-card text-xs"
              />
              <Input
                value={c.hex}
                onChange={(e) => {
                  const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                  setForm({
                    ...form,
                    palette: form.palette.map((x, j) => (i === j ? { ...x, hex: v } : x)),
                  });
                }}
                maxLength={7}
                className="h-8 w-28 bg-card font-mono text-xs uppercase"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  setForm({
                    ...form,
                    palette: form.palette.filter((_, j) => j !== i),
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              setForm({
                ...form,
                palette: [
                  ...form.palette,
                  { label: `Cor ${form.palette.length + 1}`, hex: "#6366f1" },
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar cor
          </Button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <LabeledTextarea
            label="Faça"
            rows={4}
            value={form.do_text}
            onChange={(v) => setForm({ ...form, do_text: v })}
            placeholder="Diretrizes visuais e de tom que a marca deve seguir."
          />
          <LabeledTextarea
            label="Não faça"
            rows={4}
            value={form.dont_text}
            onChange={(v) => setForm({ ...form, dont_text: v })}
            placeholder="O que evitar em criação e comunicação."
          />
        </div>
      </SectionCard>
    </div>
  );
}

/* --- Volumetria --- */

function VolumetriaTab({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Volume semanal por canal" hint="Meta de publicações por semana.">
        <div className="space-y-5">
          {SOCIALS.map(({ key, label }) => {
            const value = form.volumetry[key];
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">{label}</Label>
                  <span className="font-mono text-xs text-muted-foreground">
                    {value} / semana
                  </span>
                </div>
                <Slider
                  min={0}
                  max={21}
                  step={1}
                  value={[value]}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      volumetry: { ...form.volumetry, [key]: v[0] ?? 0 },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Metas & restrições" hint="Objetivos de negócio e limitações.">
        <LabeledTextarea
          label="Metas e restrições"
          rows={12}
          value={form.goals}
          onChange={(v) => setForm({ ...form, goals: v })}
          placeholder="Ex.: meta de leads/mês, temas sensíveis, aprovações jurídicas, blackout de campanhas."
        />
      </SectionCard>
    </div>
  );
}

// prevent unused-import warning for Link during tree-shaking edge cases
void Link;