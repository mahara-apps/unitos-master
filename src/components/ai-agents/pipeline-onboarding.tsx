import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, FileText, Target, Users, Layers, BarChart3, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type StepKey = "briefing" | "voice" | "personas" | "cohorts" | "swot" | "pauta";

const STEPS: { key: StepKey; label: string; hint: string; Icon: typeof FileText }[] = [
  { key: "briefing", label: "Estruturando briefing", hint: "Organizando o texto bruto em campos canônicos", Icon: FileText },
  { key: "voice", label: "Modelando tom de voz", hint: "Destilando estilo, expressões e CTAs da marca", Icon: Target },
  { key: "personas", label: "Mapeando personas", hint: "3–5 perfis de audiência acionáveis", Icon: Users },
  { key: "cohorts", label: "Construindo cohorts", hint: "Segmentação comportamental por estágio de funil", Icon: Layers },
  { key: "swot", label: "Analisando SWOT", hint: "Matriz estratégica + competitiva", Icon: BarChart3 },
  { key: "pauta", label: "Injetando ideias no pipeline", hint: "Cada pauta vira um card em Ideia (aguardando aprovação)", Icon: Calendar },
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
  const [enqueuing, setEnqueuing] = useState(false);
  const qc = useQueryClient();

  const run = async () => {
    if (text.trim().length < 20) {
      toast.error("Cole um briefing com pelo menos 20 caracteres.");
      return;
    }
    setEnqueuing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/jobs/customer-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brandId,
          clientId,
          texto: text.trim(),
          pautasQuantidade: 8,
          pautasPeriodo: "próximos 15 dias",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Fase 1 rodando em segundo plano — acompanhe pelo Dock.");
      qc.invalidateQueries({ queryKey: ["ai-jobs", "active"] });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar o pipeline");
    } finally {
      setEnqueuing(false);
    }
  };

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-8">
          <div className="mb-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
              <Sparkles className="h-3 w-3" /> onboarding · fase 1 em segundo plano
            </div>
            <h2 className="text-2xl font-semibold">Inicialize este cliente com IA</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cole qualquer material que você já tenha: notas do kickoff, transcrição da call,
              bullets do deck ou site do cliente. Os agentes de briefing, tom, personas, cohorts,
              SWOT e pauta rodam em segundo plano e injetam cada ideia como um card no pipeline
              — aguardando sua aprovação para gerar copy e briefing visual.
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
              disabled={text.trim().length < 20 || enqueuing}
              className="gap-2 bg-gradient-to-r from-cyan-500 to-indigo-500 text-white hover:from-cyan-400 hover:to-indigo-400"
            >
              {enqueuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Rodar Fase 1 em segundo plano
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
          Fase 1 roda em background · você pode navegar livremente · cada ideia vira um card em Ideia aguardando aprovação para acionar copy e briefing visual (Fase 2).
        </p>
      </div>
  );
}