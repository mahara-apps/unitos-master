import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, CheckCircle2, Circle, AlertTriangle, FileText, Target, Users, Layers, BarChart3, Calendar } from "lucide-react";
import {
  briefingParseFn,
  voiceGenerateFn,
  personasGenerateFn,
  cohortsGenerateFn,
  swotGenerateFn,
  pautaSuggestFn,
} from "@/lib/ai-agents.functions";

type StepKey = "briefing" | "voice" | "personas" | "cohorts" | "swot" | "pauta";
type StepState = "idle" | "running" | "done" | "error";

const STEPS: { key: StepKey; label: string; hint: string; Icon: typeof FileText }[] = [
  { key: "briefing", label: "Estruturando briefing", hint: "Organizando o texto bruto em campos canônicos", Icon: FileText },
  { key: "voice", label: "Modelando tom de voz", hint: "Destilando estilo, expressões e CTAs da marca", Icon: Target },
  { key: "personas", label: "Mapeando personas", hint: "3–5 perfis de audiência acionáveis", Icon: Users },
  { key: "cohorts", label: "Construindo cohorts", hint: "Segmentação comportamental por estágio de funil", Icon: Layers },
  { key: "swot", label: "Analisando SWOT", hint: "Matriz estratégica + competitiva", Icon: BarChart3 },
  { key: "pauta", label: "Gerando pauta editorial", hint: "Primeiro calendário de conteúdo", Icon: Calendar },
];

const EXAMPLE_BRIEFING = `Marca: Café Aurora — cafeteria de especialidade em Pinheiros, SP.
Público: profissionais criativos entre 25-40 anos, valorizam origem do grão e ambiente para trabalhar.
Diferencial: torra própria semanal, método filtrado no balcão, wifi rápido e mesas amplas.
Objetivo dos próximos 90 dias: crescer base do Instagram de 4k para 10k e aumentar em 30% o ticket médio no delivery.
Tom: acolhedor, educativo sobre café, sem jargão hipster.
Concorrência local: Coffee Lab, Suplicy, Isso é Café.
Ofertas atuais: assinatura mensal de grãos (R$ 89) e combo café + croissant no delivery.`;

export function PipelineOnboarding({
  brandId,
  clientId,
  onDone,
}: {
  brandId: string;
  clientId: string;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<Record<StepKey, StepState>>({
    briefing: "idle",
    voice: "idle",
    personas: "idle",
    cohorts: "idle",
    swot: "idle",
    pauta: "idle",
  });
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const briefingFn = useServerFn(briefingParseFn);
  const voiceFn = useServerFn(voiceGenerateFn);
  const personasFn = useServerFn(personasGenerateFn);
  const cohortsFn = useServerFn(cohortsGenerateFn);
  const swotFn = useServerFn(swotGenerateFn);
  const pautaFn = useServerFn(pautaSuggestFn);

  const setStep = (k: StepKey, s: StepState) =>
    setState((prev) => ({ ...prev, [k]: s }));

  const run = async () => {
    if (text.trim().length < 20) {
      toast.error("Cole um briefing com pelo menos 20 caracteres.");
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setState({
      briefing: "idle",
      voice: "idle",
      personas: "idle",
      cohorts: "idle",
      swot: "idle",
      pauta: "idle",
    });
    try {
      setStep("briefing", "running");
      const b = await briefingFn({ data: { brandId, clientId, texto: text.trim() } });
      setStep("briefing", "done");

      setStep("voice", "running");
      await voiceFn({ data: { brandId, clientId, briefingJson: b.output } });
      setStep("voice", "done");

      setStep("personas", "running");
      const p = await personasFn({ data: { brandId, clientId, briefingJson: b.output } });
      setStep("personas", "done");

      setStep("cohorts", "running");
      const co = await cohortsFn({
        data: { brandId, clientId, briefingJson: b.output, personasJson: p.output },
      });
      setStep("cohorts", "done");

      setStep("swot", "running");
      const sw = await swotFn({
        data: {
          brandId,
          clientId,
          briefingJson: b.output,
          personasJson: p.output,
          cohortsJson: co.output,
        },
      });
      setStep("swot", "done");

      setStep("pauta", "running");
      await pautaFn({
        data: {
          brandId,
          clientId,
          briefingJson: b.output,
          personasJson: p.output,
          cohortsJson: co.output,
          swotJson: sw.output,
          quantidade: 8,
          periodo: "próximos 15 dias",
        },
      });
      setStep("pauta", "done");

      toast.success("Pipeline concluído.");
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setState((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next) as StepKey[]) {
          if (next[k] === "running") next[k] = "error";
        }
        return next;
      });
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  if (!running && Object.values(state).every((s) => s === "idle")) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-8">
          <div className="mb-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
              <Sparkles className="h-3 w-3" /> onboarding · pipeline em 1 clique
            </div>
            <h2 className="text-2xl font-semibold">Inicialize este cliente com IA</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cole qualquer material que você já tenha: notas do kickoff, transcrição da call de
              descoberta, bullets do deck, posts antigos ou site do cliente. Seis agentes vão rodar
              em sequência e preencher briefing, tom de voz, personas, cohorts, SWOT e a primeira
              pauta editorial — tudo escopado a este cliente.
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2"
              >
                <s.Icon className="h-3.5 w-3.5 text-cyan-400" />
                <span className="truncate text-[11px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          <Label className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground">
            Briefing bruto
          </Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o briefing do cliente…"
            className="min-h-56 resize-y bg-black/40 font-mono text-xs"
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-muted-foreground">
                {text.trim().length} caracteres · mínimo 20
              </span>
              <button
                type="button"
                onClick={() => setText(EXAMPLE_BRIEFING)}
                className="font-mono text-[10px] uppercase text-cyan-300 underline-offset-4 hover:underline"
              >
                usar briefing de exemplo
              </button>
            </div>
            <Button
              onClick={run}
              disabled={text.trim().length < 20}
              className="gap-2 bg-gradient-to-r from-cyan-500 to-indigo-500 text-white hover:from-cyan-400 hover:to-indigo-400"
            >
              <Sparkles className="h-4 w-4" />
              Rodar pipeline de IA
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-neutral-950/40 p-4 text-[11px] text-muted-foreground">
          <div className="mb-2 font-mono uppercase tracking-widest text-cyan-300/80">
            dicas para um bom briefing
          </div>
          <ul className="space-y-1.5 pl-4 [&>li]:list-disc">
            <li>Descreva a marca em uma frase — segmento, praça e proposta de valor.</li>
            <li>Diga quem é o público: idade, ocupação, dores e o que valorizam.</li>
            <li>Liste 2–4 concorrentes ou referências para o SWOT ficar mais afiado.</li>
            <li>Defina os objetivos dos próximos 30/60/90 dias (métricas quando possível).</li>
            <li>Inclua ofertas, produtos ou serviços que a IA deve destacar na pauta.</li>
          </ul>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Executa seis chamadas sequenciais de modelo · ~30–90s no total · tudo pode ser editado ou regerado depois.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              pipeline · em execução
            </div>
            <h2 className="mt-1 text-xl font-semibold">Inicializando a inteligência do cliente…</h2>
          </div>
          {running && <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />}
        </div>
        <ol className="relative space-y-4 border-l border-white/10 pl-6">
          {STEPS.map((s) => {
            const st = state[s.key];
            return (
              <li key={s.key} className="relative">
                <span className="absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-neutral-950">
                  {st === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : st === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  ) : st === "error" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground" />
                  )}
                </span>
                <div
                  className={
                    "rounded-lg border p-3 transition " +
                    (st === "running"
                      ? "border-cyan-500/30 bg-cyan-500/5"
                      : st === "done"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : st === "error"
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-white/10 bg-neutral-900/40")
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{s.label}</div>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {st}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</div>
                  {st === "running" && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {errorMsg && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
            {errorMsg}
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={run} disabled={running}>
                Tentar novamente
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}