import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Check, RefreshCw, ImageIcon, Wand2, ShieldCheck, PenLine, Target, Brain, Instagram, Send, Info,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/arena")({
  component: ArenaPage,
});

type AgentMsg = {
  agent: "estrategista" | "redator" | "revisor" | "designer";
  role: string;
  icon: typeof Target;
  color: string;
  status: "done" | "running" | "queued";
  time: string;
  body: React.ReactNode;
};

const timeline: AgentMsg[] = [
  {
    agent: "estrategista", role: "Estrategista", icon: Target, color: "text-blue-400", status: "done", time: "há 8s",
    body: (
      <div className="space-y-2">
        <p>Definindo gancho para o público de <strong>gestoras de clínicas</strong> — dor central: "medo de multa da ANPD".</p>
        <div className="rounded border border-border/60 bg-background/50 p-2 text-xs">
          <span className="text-muted-foreground">Ângulo: </span>
          Educativo com prova social · CTA soft (baixar checklist) · Formato carrossel 6 slides.
        </div>
      </div>
    ),
  },
  {
    agent: "redator", role: "Redator", icon: PenLine, color: "text-purple-400", status: "done", time: "há 4s",
    body: (
      <div className="space-y-2">
        <div className="rounded-md border border-border/60 bg-background/50 p-3 font-mono text-xs leading-relaxed">
          <p className="mb-2">🔒 <strong>3 erros de LGPD que podem custar caro à sua clínica</strong></p>
          <p className="text-muted-foreground">
            A maioria das clínicas ainda armazena prontuários em pastas compartilhadas — e isso já rendeu autuações de R$ 50k+ em 2025.<br/><br/>
            No carrossel: os 3 erros mais comuns, o que a ANPD fiscaliza primeiro e o checklist gratuito que a nossa equipe montou.<br/><br/>
            Salve esse post — você vai precisar dele antes da próxima auditoria.
          </p>
        </div>
      </div>
    ),
  },
  {
    agent: "revisor", role: "Revisor de Compliance", icon: ShieldCheck, color: "text-emerald-400", status: "done", time: "há 2s",
    body: (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs"><Check className="h-3 w-3 text-emerald-400" /> Sem promessas terapêuticas — OK CFM</div>
        <div className="flex items-center gap-2 text-xs"><Check className="h-3 w-3 text-emerald-400" /> Tom alinhado ao brandbook v3.2</div>
        <div className="flex items-center gap-2 text-xs"><Info className="h-3 w-3 text-amber-400" /> Sugestão: trocar "custar caro" por "gerar autuações" (mais preciso)</div>
      </div>
    ),
  },
  {
    agent: "designer", role: "Diretor de Arte", icon: Brain, color: "text-pink-400", status: "running", time: "gerando…",
    body: (
      <div className="text-xs text-muted-foreground">Renderizando 3 variações visuais no estilo <strong>Vitta Saúde</strong> · paleta verde-menta · logo será injetada no canto inferior direito.</div>
    ),
  },
];

function ArenaPage() {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[380px_1fr]">
      {/* LEFT: context */}
      <aside className="flex flex-col border-r border-border/60 bg-card/30">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <div>
              <div className="text-sm font-semibold">Vitta Saúde</div>
              <div className="text-[10px] text-muted-foreground">Post educativo · LGPD para clínicas</div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">Brief v3</Badge>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-5 p-4 text-xs">
            <section>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Objetivo</div>
              <p>Gerar autoridade e capturar leads via checklist gratuito. Meta: 40 downloads / post.</p>
            </section>
            <section>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tom de voz</div>
              <div className="flex flex-wrap gap-1">
                {["Confiável", "Direto", "Sem jargão médico", "Empático"].map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </section>
            <section>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Persona alvo</div>
              <div className="rounded border border-border/60 bg-background/50 p-2">
                <p className="font-medium">Camila · 38 · Gestora administrativa</p>
                <p className="mt-1 text-muted-foreground">Rede com 4 unidades. Preocupada com auditorias, tempo escasso, decisão B2B.</p>
              </div>
            </section>
            <section>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Assets de marca</div>
              <div className="grid grid-cols-3 gap-1.5">
                {["Logo", "Paleta", "Fonte", "Padrões", "Fotos", "Ícones"].map((a) => (
                  <div key={a} className="flex aspect-square items-center justify-center rounded border border-border/60 bg-background/50 text-[10px] text-muted-foreground">
                    {a}
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Regras (RAG)</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Não citar concorrentes por nome</li>
                <li>• Evitar promessas de cura</li>
                <li>• CTA sempre para checklist grátis</li>
                <li>• Hashtags: máx. 5, sem #saude genérica</li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </aside>

      {/* RIGHT: arena */}
      <section className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Arena de IA</span>
            <Badge variant="outline" className="gap-1 text-[10px]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />4 agentes</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs"><RefreshCw className="h-3 w-3" /> Regenerar</Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl space-y-4 p-6">
            {timeline.map((m, i) => (
              <div key={i} className="flex gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background ${m.color}`}>
                  <m.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium">{m.role}</span>
                    {m.status === "running" ? (
                      <Badge variant="outline" className="gap-1 text-[10px]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />trabalhando</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">concluído</Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">{m.time}</span>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs">{m.body}</div>
                </div>
              </div>
            ))}

            {/* generated image preview */}
            <div className="mt-6 rounded-xl border border-border/60 bg-card/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <ImageIcon className="h-3.5 w-3.5" /> Visual gerado — 3 variações
                </div>
                <Badge variant="outline" className="text-[10px]">1080×1350</Badge>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br from-emerald-950/40 via-background to-emerald-900/20">
                    <div className="absolute inset-0 flex flex-col justify-between p-3">
                      <div className="text-[10px] font-mono text-emerald-300/80">v{i + 1}</div>
                      <div>
                        <div className="text-sm font-bold leading-tight text-emerald-50/90">3 erros de LGPD<br/>para clínicas</div>
                        <div className="mt-2 flex h-6 w-16 items-center justify-center rounded border border-dashed border-emerald-400/50 text-[9px] text-emerald-300/70">
                          logo →
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border/60 bg-background/60 p-4 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <Button variant="default" size="sm" className="gap-1.5"><Check className="h-3.5 w-3.5" /> Aprovar internamente</Button>
              <Button variant="outline" size="sm" className="gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Solicitar ajuste à IA</Button>
              <Button variant="ghost" size="sm" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Enviar ao cliente</Button>
              <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
                <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">DP</AvatarFallback></Avatar>
                Diego P. · último edit há 12s
              </div>
            </div>
            <Separator className="my-2" />
            <div className="relative">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='Ex.: "torne o CTA mais suave e reduza para 4 slides"'
                className="min-h-[64px] resize-none border-border/60 bg-card/40 pr-24 text-xs"
              />
              <Button size="sm" className="absolute bottom-2 right-2 h-7 gap-1.5">
                <Sparkles className="h-3 w-3" /> Enviar
              </Button>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Instagram className="h-3 w-3" /> Canal: Instagram</span>
              <span>Modelo: GPT-5 + Gemini 2.5 (revisão)</span>
              <span className="ml-auto">Custo estimado: $ 0,032</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}