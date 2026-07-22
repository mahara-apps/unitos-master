import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Loader2, Sparkles } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  getBrandHub,
  updateBrandHub,
  type BrandHubData,
} from "@/lib/brand-hub.functions";
import { supabase } from "@/integrations/supabase/client";

type SocialKey = "instagram" | "tiktok" | "linkedin" | "youtube" | "facebook";
const SOCIALS: Array<{ key: SocialKey; label: string }> = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
];

type State = {
  tone_text: string;
  mission: string;
  positioning: string;
  offer: string;
  price_range: string;
  audience: string;
  pain_points: string;
  volumetry: Record<SocialKey, number>;
  goals: string;
};

const EMPTY: State = {
  tone_text: "",
  mission: "",
  positioning: "",
  offer: "",
  price_range: "",
  audience: "",
  pain_points: "",
  volumetry: { instagram: 0, tiktok: 0, linkedin: 0, youtube: 0, facebook: 0 },
  goals: "",
};

function fromHub(hub: BrandHubData, toneFallback?: string | null): State {
  return {
    tone_text: hub.tone_text ?? toneFallback ?? "",
    mission: hub.mission ?? "",
    positioning: hub.positioning ?? "",
    offer: hub.offer ?? "",
    price_range: hub.price_range ?? "",
    audience: hub.audience ?? "",
    pain_points: hub.pain_points ?? "",
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

export function QuickOnboardingWizard({
  brandId,
  clientId,
  open,
  onOpenChange,
  onOpenFullBriefing,
}: {
  brandId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenFullBriefing?: () => void;
}) {
  const qc = useQueryClient();
  const fetchHub = useServerFn(getBrandHub);
  const saveHub = useServerFn(updateBrandHub);

  const hubQ = useQuery({
    queryKey: ["brand-hub", brandId, clientId],
    queryFn: () => fetchHub({ data: { brandId, clientId } }),
    enabled: open,
  });

  const [step, setStep] = useState(1);
  const [state, setState] = useState<State>(EMPTY);
  const [genLoading, setGenLoading] = useState(false);

  // Seed state from current hub once loaded / whenever wizard opens.
  useEffect(() => {
    if (open && hubQ.data) {
      setState(fromHub(hubQ.data.brand_hub ?? {}, hubQ.data.tone_of_voice));
    }
  }, [open, hubQ.data]);

  useEffect(() => {
    if (open) setStep(1);
  }, [open, clientId]);

  const save = useMutation({
    mutationFn: async (patch: Partial<BrandHubData>) => {
      await saveHub({ data: { brandId, clientId, patch } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar"),
  });

  const setField = <K extends keyof State>(k: K, v: State[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const advance = async (patch: Partial<BrandHubData>) => {
    await save.mutateAsync(patch);
    setStep((s) => Math.min(s + 1, 4));
  };

  const skip = () => setStep((s) => Math.min(s + 1, 4));
  const skipAll = () => onOpenChange(false);

  const runStrategy = async () => {
    setGenLoading(true);
    try {
      // Persist current step before firing, if user landed on completion.
      await save.mutateAsync({
        volumetry: state.volumetry,
        goals: state.goals,
      });

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
          pautasQuantidade: 8,
          pautasPeriodo: "próximos 15 dias",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Inteligência rodando em segundo plano — acompanhe pelo indicador de IA.");
      qc.invalidateQueries({ queryKey: ["ai-jobs", "active"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a estratégia");
    } finally {
      setGenLoading(false);
    }
  };

  const totalSteps = 3;
  const progressPct = step > totalSteps ? 100 : Math.round(((step - 1) / totalSteps) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-base">Onboarding rápido</DialogTitle>
              <DialogDescription className="text-xs">
                Só o essencial para a IA gerar a primeira estratégia.
              </DialogDescription>
            </div>
            <StepBadge step={step} total={totalSteps} />
          </div>
          <div className="mt-3">
            <Progress value={progressPct} className="h-1" />
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {hubQ.isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : step === 1 ? (
            <StepIdentity state={state} setField={setField} />
          ) : step === 2 ? (
            <StepProductAudience state={state} setField={setField} />
          ) : step === 3 ? (
            <StepGoals state={state} setField={setField} />
          ) : (
            <StepDone />
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-6 py-3">
          <button
            type="button"
            onClick={skipAll}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Pular e ver tudo
          </button>

          <div className="flex items-center gap-2">
            {step <= totalSteps && (
              <button
                type="button"
                onClick={skip}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                disabled={save.isPending}
              >
                Pular esta etapa
              </button>
            )}

            {step === 1 && (
              <Button
                size="sm"
                onClick={() =>
                  advance({
                    tone_text: state.tone_text,
                    mission: state.mission,
                    positioning: state.positioning,
                  })
                }
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Próximo
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {step === 2 && (
              <Button
                size="sm"
                onClick={() =>
                  advance({
                    offer: state.offer,
                    price_range: state.price_range,
                    audience: state.audience,
                    pain_points: state.pain_points,
                  })
                }
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Próximo
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {step === 3 && (
              <Button
                size="sm"
                onClick={() =>
                  advance({ volumetry: state.volumetry, goals: state.goals })
                }
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Concluir
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {step > totalSteps && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenFullBriefing?.();
                  }}
                >
                  Ver briefing completo
                </Button>
                <Button
                  size="sm"
                  onClick={runStrategy}
                  disabled={genLoading}
                  className="gap-1.5 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:from-fuchsia-500 hover:to-violet-500"
                >
                  {genLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Gerar Inteligência com IA
                </Button>
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function StepBadge({ step, total }: { step: number; total: number }) {
  const label = step > total ? "Concluído" : `${step} de ${total}`;
  return (
    <span className="rounded-full border border-border/60 bg-background px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {label}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StepIdentity({
  state,
  setField,
}: {
  state: State;
  setField: <K extends keyof State>(k: K, v: State[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold tracking-tight">Identidade</h3>
      <Field label="Tom de voz" hint="Ex.: próximo, provocador, direto, com humor.">
        <Textarea
          rows={2}
          value={state.tone_text}
          onChange={(e) => setField("tone_text", e.target.value)}
          placeholder="Como a marca fala com o público?"
        />
      </Field>
      <Field label="Missão">
        <Textarea
          rows={2}
          value={state.mission}
          onChange={(e) => setField("mission", e.target.value)}
          placeholder="Por que essa marca existe?"
        />
      </Field>
      <Field label="Posicionamento" hint="O lugar que a marca ocupa na cabeça do público.">
        <Textarea
          rows={3}
          value={state.positioning}
          onChange={(e) => setField("positioning", e.target.value)}
          placeholder="Para quem, contra quem, com que promessa."
        />
      </Field>
    </div>
  );
}

function StepProductAudience({
  state,
  setField,
}: {
  state: State;
  setField: <K extends keyof State>(k: K, v: State[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold tracking-tight">Produto & Público</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Oferta principal">
          <Input
            value={state.offer}
            onChange={(e) => setField("offer", e.target.value)}
            placeholder="Ex.: Consultoria de branding"
          />
        </Field>
        <Field label="Faixa de preço">
          <Input
            value={state.price_range}
            onChange={(e) => setField("price_range", e.target.value)}
            placeholder="Ex.: R$ 3-8k / projeto"
          />
        </Field>
      </div>
      <Field label="Descrição do público">
        <Textarea
          rows={3}
          value={state.audience}
          onChange={(e) => setField("audience", e.target.value)}
          placeholder="Quem compra: idade, contexto, comportamento."
        />
      </Field>
      <Field label="Dores">
        <Textarea
          rows={3}
          value={state.pain_points}
          onChange={(e) => setField("pain_points", e.target.value)}
          placeholder="Frustrações que esse público sente hoje."
        />
      </Field>
    </div>
  );
}

function StepGoals({
  state,
  setField,
}: {
  state: State;
  setField: <K extends keyof State>(k: K, v: State[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold tracking-tight">Metas</h3>

      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Volumetria semanal por canal</Label>
          <span className="text-[11px] text-muted-foreground">posts / semana</span>
        </div>
        <div className="grid gap-2">
          {SOCIALS.map((s) => (
            <div key={s.key} className="grid grid-cols-[80px_1fr_32px] items-center gap-3">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <Slider
                min={0}
                max={14}
                step={1}
                value={[state.volumetry[s.key] ?? 0]}
                onValueChange={([v]) =>
                  setField("volumetry", { ...state.volumetry, [s.key]: v ?? 0 })
                }
              />
              <span className="text-right text-xs tabular-nums text-foreground">
                {state.volumetry[s.key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Field label="Metas e restrições" hint="Objetivos, KPIs, temas proibidos, regras de compliance.">
        <Textarea
          rows={4}
          value={state.goals}
          onChange={(e) => setField("goals", e.target.value)}
          placeholder="Ex.: crescer 20% em seguidores, evitar tema política."
        />
      </Field>
    </div>
  );
}

function StepDone() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className={cn("rounded-full bg-emerald-500/10 p-3 text-emerald-500")}>
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight">Base pronta</h3>
      <p className="max-w-md text-sm text-muted-foreground">
        Os campos essenciais foram salvos. Você já pode gerar a primeira
        inteligência com IA — voz, personas, cohorts e SWOT — ou refinar o
        briefing completo antes.
      </p>
    </div>
  );
}

function buildBriefing(s: State, name?: string, niche?: string | null): string {
  const lines: string[] = [];
  const push = (k: string, v?: string | null) => {
    const t = (v ?? "").trim();
    if (t) lines.push(`${k}: ${t}`);
  };
  push("Marca", name);
  push("Nicho", niche ?? undefined);
  push("Tom de voz", s.tone_text);
  push("Missão", s.mission);
  push("Posicionamento", s.positioning);
  push("Oferta", s.offer);
  push("Faixa de preço", s.price_range);
  push("Público", s.audience);
  push("Dores", s.pain_points);
  push("Metas", s.goals);
  const vol = Object.entries(s.volumetry)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${k}: ${n}/sem`)
    .join(", ");
  push("Volumetria semanal", vol);
  return lines.join("\n");
}