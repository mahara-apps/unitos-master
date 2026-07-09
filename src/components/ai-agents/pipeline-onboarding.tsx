import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
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

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: "briefing", label: "Parsing briefing", hint: "Structuring raw context into fields" },
  { key: "voice", label: "Crafting brand voice", hint: "Distilling tone, phrases and CTAs" },
  { key: "personas", label: "Mapping personas", hint: "3–5 actionable audience profiles" },
  { key: "cohorts", label: "Building cohorts", hint: "Behavioral segmentation" },
  { key: "swot", label: "Running SWOT", hint: "Strategic + competitive matrix" },
  { key: "pauta", label: "Generating editorial plan", hint: "First content calendar" },
];

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
      toast.error("Paste a briefing with at least 20 characters.");
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

      toast.success("Pipeline complete.");
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
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-8">
          <div className="mb-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
              <Sparkles className="h-3 w-3" /> onboarding · one-click pipeline
            </div>
            <h2 className="text-2xl font-semibold">Bootstrap this customer with AI</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Paste anything you have: kickoff notes, discovery call transcript, deck bullets,
              past posts. Six agents will run in sequence and populate briefing, voice, personas,
              cohorts, SWOT and the first editorial plan — all scoped to this customer.
            </p>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the raw briefing here…"
            className="min-h-56 resize-y bg-black/40 font-mono text-xs"
          />
          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {text.trim().length} chars · min 20
            </span>
            <Button
              onClick={run}
              disabled={text.trim().length < 20}
              className="gap-2 bg-gradient-to-r from-cyan-500 to-indigo-500 text-white hover:from-cyan-400 hover:to-indigo-400"
            >
              <Sparkles className="h-4 w-4" />
              Run AI Pipeline
            </Button>
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Ships six sequential model calls · ~30–90s total · you can edit or regenerate anything after.
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
              pipeline · running
            </div>
            <h2 className="mt-1 text-xl font-semibold">Bootstrapping customer intelligence…</h2>
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
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}