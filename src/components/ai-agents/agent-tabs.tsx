import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import {
  briefingParseFn,
  voiceGenerateFn,
  personasGenerateFn,
  cohortsGenerateFn,
  swotGenerateFn,
  pautaSuggestFn,
  contentGenerateFn,
  competitorExtractFn,
  loadClientContextFn,
} from "@/lib/ai-agents.functions";

// ---------- Contexto ----------

export type ClientContext = Awaited<ReturnType<typeof loadClientContextFn>>;

export function useClientContext(brandId: string, clientId: string) {
  const load = useServerFn(loadClientContextFn);
  const qc = useQueryClient();
  const query = useQuery<ClientContext>({
    queryKey: ["client-ai-context", brandId, clientId],
    queryFn: () => load({ data: { brandId, clientId } }),
  });
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["client-ai-context", brandId, clientId] });
  return { ctx: query.data, isLoading: query.isLoading, invalidate };
}

// ---------- UI primitives ----------

export function AgentCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-950/60 p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  if (value == null) return null;
  return (
    <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-cyan-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function requireCtx<T>(v: T | null | undefined, label: string): T {
  if (!v) throw new Error(`${label} ainda não gerado — rode o agente anterior primeiro.`);
  return v;
}

function useAgentMutation<TInput, TOutput>(
  fn: (opts: { data: TInput }) => Promise<TOutput>,
  onSuccessLabel: string,
  onDone?: () => void,
) {
  const wrapped = useServerFn(fn as unknown as Parameters<typeof useServerFn>[0]) as unknown as (
    opts: { data: TInput },
  ) => Promise<TOutput>;
  return useMutation({
    mutationFn: (input: TInput) => wrapped({ data: input }),
    onSuccess: () => {
      toast.success(onSuccessLabel);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

type TabProps = {
  brandId: string;
  clientId: string;
  ctx: ClientContext | undefined;
  onDone: () => void;
};

// ---------- 1. Briefing ----------

export function BriefingTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const [texto, setTexto] = useState("");
  const m = useAgentMutation(briefingParseFn, "Briefing estruturado.", onDone);
  const current = ctx?.briefing;
  return (
    <AgentCard
      title="1 · briefing.parse"
      description="Cola o texto bruto do briefing (ou o conteúdo extraído de um .docx) e a IA estrutura em JSON canônico."
    >
      <Label className="font-mono text-[10px] uppercase text-muted-foreground">Texto bruto</Label>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Cole aqui o briefing do cliente..."
        className="mt-1 min-h-40 border-white/10 bg-white/[0.02] font-mono text-xs"
      />
      <Button
        disabled={m.isPending || texto.length < 20}
        onClick={() => m.mutate({ brandId, clientId, texto })}
        className="mt-3 bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Estruturar briefing
      </Button>
      {m.data && <JsonBlock value={m.data.output} />}
      {!m.data && current && (
        <>
          <div className="mt-4 font-mono text-[10px] uppercase text-muted-foreground">
            último briefing salvo · completude {current.completude}%
          </div>
          <JsonBlock value={current.data} />
        </>
      )}
    </AgentCard>
  );
}

// ---------- 2. Voice ----------

export function VoiceTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const m = useAgentMutation(voiceGenerateFn, "Voice Card gerado.", onDone);
  const current = ctx?.voice;
  return (
    <AgentCard
      title="2 · voice.generate"
      description="Gera o Voice Card canônico a partir do briefing. Este artefato é injetado em todo agente downstream."
    >
      <Button
        disabled={m.isPending || !ctx?.briefing}
        onClick={() => {
          try {
            m.mutate({
              brandId,
              clientId,
              briefingJson: requireCtx(ctx?.briefing?.data, "Briefing"),
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {current ? "Regerar Voice Card" : "Gerar Voice Card"}
      </Button>
      {!ctx?.briefing && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Precisa de briefing estruturado antes.
        </div>
      )}
      {m.data && <JsonBlock value={m.data.output} />}
      {!m.data && current && <JsonBlock value={current.data} />}
    </AgentCard>
  );
}

// ---------- 3. Personas ----------

export function PersonasTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const m = useAgentMutation(personasGenerateFn, "Personas geradas.", onDone);
  const current = ctx?.personas;
  return (
    <AgentCard title="3 · personas.generate" description="3-5 personas acionáveis ancoradas no briefing.">
      <Button
        disabled={m.isPending || !ctx?.briefing}
        onClick={() => {
          try {
            m.mutate({
              brandId,
              clientId,
              briefingJson: requireCtx(ctx?.briefing?.data, "Briefing"),
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {current ? "Regerar personas" : "Gerar personas"}
      </Button>
      {m.data && <JsonBlock value={m.data.output} />}
      {!m.data && current && <JsonBlock value={current.data} />}
    </AgentCard>
  );
}

// ---------- 4. Cohorts ----------

export function CohortsTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const m = useAgentMutation(cohortsGenerateFn, "Cohorts gerados.", onDone);
  const current = ctx?.cohorts;
  return (
    <AgentCard title="4 · cohorts.generate" description="Segmentação comportamental por estágio de funil.">
      <Button
        disabled={m.isPending || !ctx?.briefing || !ctx?.personas}
        onClick={() => {
          try {
            m.mutate({
              brandId,
              clientId,
              briefingJson: requireCtx(ctx?.briefing?.data, "Briefing"),
              personasJson: requireCtx(ctx?.personas?.data, "Personas"),
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {current ? "Regerar cohorts" : "Gerar cohorts"}
      </Button>
      {m.data && <JsonBlock value={m.data.output} />}
      {!m.data && current && <JsonBlock value={current.data} />}
    </AgentCard>
  );
}

// ---------- 5. SWOT ----------

export function SwotTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const m = useAgentMutation(swotGenerateFn, "SWOT gerado.", onDone);
  const current = ctx?.swot;
  return (
    <AgentCard title="5 · swot.generate" description="Forças, fraquezas, oportunidades, ameaças + tabela competitiva.">
      <Button
        disabled={m.isPending || !ctx?.briefing || !ctx?.personas || !ctx?.cohorts}
        onClick={() => {
          try {
            m.mutate({
              brandId,
              clientId,
              briefingJson: requireCtx(ctx?.briefing?.data, "Briefing"),
              personasJson: requireCtx(ctx?.personas?.data, "Personas"),
              cohortsJson: requireCtx(ctx?.cohorts?.data, "Cohorts"),
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {current ? "Regerar SWOT" : "Gerar SWOT"}
      </Button>
      {m.data && <JsonBlock value={m.data.output} />}
      {!m.data && current && <JsonBlock value={current.data} />}
    </AgentCard>
  );
}

// ---------- 6. Pautas ----------

export function PautaTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const [quantidade, setQuantidade] = useState(10);
  const [periodo, setPeriodo] = useState("próxima semana");
  const m = useAgentMutation(pautaSuggestFn, "Pautas geradas e salvas.", onDone);
  return (
    <AgentCard title="6 · pauta.suggest" description="Sugestões de pauta distribuídas entre cohorts e formatos.">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Quantidade</Label>
          <Input
            type="number"
            value={quantidade}
            onChange={(e) => setQuantidade(Number(e.target.value) || 1)}
            min={1}
            max={30}
            className="mt-1 border-white/10 bg-white/[0.02] font-mono"
          />
        </div>
        <div>
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Período</Label>
          <Input
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="mt-1 border-white/10 bg-white/[0.02]"
          />
        </div>
      </div>
      <Button
        disabled={m.isPending || !ctx?.swot}
        onClick={() => {
          try {
            m.mutate({
              brandId,
              clientId,
              briefingJson: requireCtx(ctx?.briefing?.data, "Briefing"),
              personasJson: requireCtx(ctx?.personas?.data, "Personas"),
              cohortsJson: requireCtx(ctx?.cohorts?.data, "Cohorts"),
              swotJson: requireCtx(ctx?.swot?.data, "SWOT"),
              quantidade,
              periodo,
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="mt-3 bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Gerar pautas
      </Button>
      {m.data && <JsonBlock value={m.data.output} />}
    </AgentCard>
  );
}

// ---------- 7. Content ----------

export function ContentTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const [pautaTitulo, setPautaTitulo] = useState("");
  const [gancho, setGancho] = useState("");
  const [plataforma, setPlataforma] = useState("instagram");
  const [formato, setFormato] = useState("carrossel");
  const [personaNome, setPersonaNome] = useState("");
  const m = useAgentMutation(contentGenerateFn, "Copy gerada.", onDone);
  return (
    <AgentCard title="7 · content.generate" description="Copy final indistinguível do Voice Card da marca.">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Título da pauta</Label>
          <Input value={pautaTitulo} onChange={(e) => setPautaTitulo(e.target.value)} className="mt-1 border-white/10 bg-white/[0.02]" />
        </div>
        <div className="col-span-2">
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Gancho / ângulo</Label>
          <Textarea value={gancho} onChange={(e) => setGancho(e.target.value)} className="mt-1 min-h-20 border-white/10 bg-white/[0.02]" />
        </div>
        <div>
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Plataforma</Label>
          <Input value={plataforma} onChange={(e) => setPlataforma(e.target.value)} className="mt-1 border-white/10 bg-white/[0.02]" />
        </div>
        <div>
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Formato</Label>
          <Input value={formato} onChange={(e) => setFormato(e.target.value)} className="mt-1 border-white/10 bg-white/[0.02]" />
        </div>
        <div className="col-span-2">
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Persona alvo (nome)</Label>
          <Input
            value={personaNome}
            onChange={(e) => setPersonaNome(e.target.value)}
            placeholder="ex: Marina, a decisora ocupada"
            className="mt-1 border-white/10 bg-white/[0.02]"
          />
        </div>
      </div>
      <Button
        disabled={m.isPending || !ctx?.voice}
        onClick={() => {
          try {
            const voiceCard = requireCtx(ctx?.voice?.data, "Voice Card");
            const personasWrap = ctx?.personas?.data as { personas?: Array<{ nome: string }> } | undefined;
            const personas = personasWrap?.personas ?? [];
            const persona = personas.find((p) => p.nome === personaNome) ?? personas[0] ?? { nome: personaNome };
            m.mutate({
              brandId,
              clientId,
              voiceCardJson: voiceCard,
              pautaJson: { titulo: pautaTitulo, gancho, plataforma, formato_recomendado: formato },
              personaOuCohortJson: persona,
              plataforma,
              formato,
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="mt-3 bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Gerar copy
      </Button>
      {m.data && <JsonBlock value={m.data.output} />}
    </AgentCard>
  );
}

// ---------- 8. Competitor ----------

export function CompetitorTab({ brandId, clientId, ctx, onDone }: TabProps) {
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [posts, setPosts] = useState("");
  const m = useAgentMutation(competitorExtractFn, "Snapshot do concorrente salvo.", onDone);
  return (
    <AgentCard title="8 · competitor.extract" description="Estrutura bio + posts colados e gera pautas inspiradas.">
      <div className="space-y-3">
        <div>
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Handle (opcional)</Label>
          <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@concorrente" className="mt-1 border-white/10 bg-white/[0.02] font-mono" />
        </div>
        <div>
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Bio do perfil</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} className="mt-1 min-h-20 border-white/10 bg-white/[0.02]" />
        </div>
        <div>
          <Label className="font-mono text-[10px] uppercase text-muted-foreground">Posts recentes (um por bloco)</Label>
          <Textarea value={posts} onChange={(e) => setPosts(e.target.value)} className="mt-1 min-h-40 border-white/10 bg-white/[0.02] font-mono text-xs" />
        </div>
      </div>
      <Button
        disabled={m.isPending || !ctx?.briefing || bio.length < 1 || posts.length < 1}
        onClick={() => {
          try {
            m.mutate({
              brandId,
              clientId,
              handle: handle || undefined,
              bioColada: bio,
              postsColados: posts,
              briefingJson: requireCtx(ctx?.briefing?.data, "Briefing"),
            });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="mt-3 bg-white text-black hover:bg-white/90"
      >
        {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Analisar concorrente
      </Button>
      {m.data && <JsonBlock value={m.data.output} />}
    </AgentCard>
  );
}