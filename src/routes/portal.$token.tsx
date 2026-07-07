import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Check, MessageSquareWarning, X, MessageCircle, ChevronLeft, ChevronRight,
  ZoomIn, Info, Calendar, User2, History,
} from "lucide-react";

export const Route = createFileRoute("/portal/$token")({
  component: PortalPage,
  head: () => ({
    meta: [
      { title: "Aprovação de conteúdo" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const SLIDES = [
  { title: "3 erros de LGPD", sub: "que podem custar caro", tone: "from-emerald-900 via-emerald-950 to-black" },
  { title: "Erro #1", sub: "Prontuários em pastas compartilhadas", tone: "from-teal-900 via-emerald-950 to-black" },
  { title: "Erro #2", sub: "Consentimento genérico e mal registrado", tone: "from-emerald-800 via-emerald-950 to-black" },
];

const CAPTION =
  "A maioria das clínicas ainda armazena prontuários em pastas compartilhadas — e isso já rendeu autuações de R$ 50k+ em 2025.\n\nNo carrossel: os 3 erros mais comuns, o que a ANPD fiscaliza primeiro e o checklist gratuito que a nossa equipe montou.\n\nSalve esse post — você vai precisar dele antes da próxima auditoria.";

const HISTORY = [
  { who: "Marina (Copy)", role: "copywriter", when: "há 2h", action: "criou a versão v1 da legenda" },
  { who: "Rafa (Design)", role: "designer", when: "há 1h", action: "atualizou a arte do slide 1 (nova hierarquia)" },
  { who: "Você", role: "cliente", when: "há 12min", action: "abriu o post para revisão" },
];

function PortalPage() {
  const [identity, setIdentity] = useState("");
  const [modal, setModal] = useState<null | "reject" | "comment">(null);
  const [drawer, setDrawer] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [info, setInfo] = useState(false);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "adjust">("pending");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [slide, setSlide] = useState(0);
  const s = SLIDES[slide];
  const disabled = !identity.trim();

  return (
    <div className="min-h-screen bg-zinc-950 text-foreground">
      {/* White-label header */}
      <header className="border-b border-white/10 bg-neutral-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-emerald-500/30 to-teal-500/10 text-emerald-300">
              <span className="text-sm font-bold">V</span>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Vitta Saúde</div>
              <div className="font-mono text-[10px] text-muted-foreground">portal de aprovação</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <User2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="Identifique-se para decidir"
                className="h-8 w-64 border-white/10 bg-white/[0.02] text-xs focus-visible:ring-emerald-500/40"
              />
            </div>
            <Badge variant="outline" className="border-white/10 bg-white/[0.02] font-mono text-[10px] text-muted-foreground">
              link único · 7 dias
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[1fr_320px]">
        {/* Media viewer */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">post 04 · semana 28</div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">Revise antes da publicação</h1>
            </div>
            <button
              onClick={() => setInfo(!info)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors duration-200 hover:border-white/20 hover:text-foreground"
            >
              <Info className="h-3 w-3" /> {info ? "esconder" : "info"}
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60">
            {/* Lightbox-style stage */}
            <div className="relative aspect-[4/5] w-full">
              <div className={`absolute inset-0 bg-gradient-to-br ${s.tone}`} />
              <div className="absolute inset-0 flex flex-col justify-between p-10">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-300/70">Vitta · educativo</div>
                <div>
                  <div className="text-4xl font-bold leading-[1.05] text-emerald-50">{s.title}</div>
                  <div className="mt-3 text-base text-emerald-100/70">{s.sub}</div>
                </div>
              </div>

              {/* Carousel controls */}
              <button
                onClick={() => setSlide((slide - 1 + SLIDES.length) % SLIDES.length)}
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur transition-colors duration-200 hover:bg-black/70 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSlide((slide + 1) % SLIDES.length)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur transition-colors duration-200 hover:bg-black/70 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setZoom(true)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/50 text-white/80 backdrop-blur transition-colors duration-200 hover:bg-black/70 hover:text-white"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>

              {/* Dots */}
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlide(i)}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      i === slide ? "w-6 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>

              {/* Info overlay */}
              {info && (
                <div className="absolute left-3 bottom-3 rounded-lg border border-white/10 bg-black/70 p-3 font-mono text-[10px] backdrop-blur">
                  <div className="mb-1 uppercase tracking-widest text-white/50">technical</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-white/80">
                    <span>format</span><span>carousel · 6</span>
                    <span>ratio</span><span>4:5 · 1080×1350</span>
                    <span>slide</span><span>{slide + 1} / {SLIDES.length}</span>
                    <span>schedule</span><span>qui 09/07 · 09h</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Decision desk */}
          {status === "pending" ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-3">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">mesa de decisões</span>
                {disabled && (
                  <span className="font-mono text-[10px] text-amber-300">↑ identifique-se para liberar</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setStatus("approved")}
                  tone="emerald"
                  icon={<Check className="h-4 w-4" />}
                  label="Aprovar"
                />
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setDrawer(true)}
                  tone="amber"
                  icon={<MessageSquareWarning className="h-4 w-4" />}
                  label="Pedir ajustes"
                />
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setModal("reject")}
                  tone="red"
                  icon={<X className="h-4 w-4" />}
                  label="Rejeitar"
                />
                <DecisionButton
                  disabled={disabled}
                  onClick={() => setModal("comment")}
                  tone="slate"
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="Comentar"
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-6 text-center">
              <div className="text-sm">
                {status === "approved" && <span className="text-emerald-400">✓ Post aprovado — a equipe foi notificada.</span>}
                {status === "rejected" && <span className="text-red-400">✗ Post rejeitado — vamos preparar uma nova versão.</span>}
                {status === "adjust" && <span className="text-amber-300">↻ Ajustes solicitados — voltamos em breve com a revisão.</span>}
              </div>
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setStatus("pending")}>
                Voltar
              </Button>
            </div>
          )}
        </section>

        {/* Sidebar: history + meta */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">publicação prevista</span>
            </div>
            <div className="text-lg font-semibold">qui, 09/07 · 09h00</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">Instagram · @vitta.saude</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">histórico de decisões</span>
            </div>
            <div className="space-y-2 font-mono text-[11px]">
              {HISTORY.map((h, i) => (
                <div key={i} className="flex gap-2 border-l border-white/10 pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground">{h.who}</span>
                      <span className="rounded border border-white/10 bg-white/[0.03] px-1 py-px text-[9px] uppercase text-muted-foreground">
                        {h.role}
                      </span>
                    </div>
                    <div className="text-muted-foreground">{h.action}</div>
                    <div className="text-[10px] text-muted-foreground/70">{h.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Zoom lightbox */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-3xl border-white/10 bg-neutral-950 p-2">
          <div className={`aspect-[4/5] w-full bg-gradient-to-br ${s.tone} flex flex-col justify-between rounded-lg p-12`}>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300/70">Vitta · educativo</div>
            <div className="text-6xl font-bold text-emerald-50">{s.title}</div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject / Comment modal */}
      <Dialog open={modal !== null} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="border-white/10 bg-neutral-950 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal === "reject" ? "Motivo da rejeição" : "Deixar comentário"}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              modal === "reject"
                ? "Ex.: 'Precisamos alinhar o tom antes de publicar.'"
                : "Compartilhe qualquer observação com a equipe…"
            }
            className="min-h-[120px] border-white/10 bg-white/[0.02]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (modal === "reject") setStatus("rejected");
                setModal(null);
                setNote("");
              }}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustments Drawer */}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-full border-white/10 bg-neutral-950 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Pedir ajustes</SheetTitle>
            <SheetDescription>
              Selecione um trecho da legenda ou escreva um feedback geral.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                legenda original · selecione um trecho
              </div>
              <div
                onMouseUp={() => {
                  const sel = window.getSelection()?.toString() ?? "";
                  if (sel) setSelected(sel);
                }}
                className="max-h-64 overflow-auto whitespace-pre-line rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm leading-relaxed selection:bg-amber-300/40 selection:text-amber-50"
              >
                {CAPTION}
              </div>
              {selected && (
                <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2 text-xs">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-amber-300">selecionado</span>
                  <div className="mt-1 italic text-amber-100/90">"{selected}"</div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">seu feedback</div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: 'A legenda ficou longa, poderia ter um CTA mais forte no final.'"
                className="min-h-[120px] border-white/10 bg-white/[0.02]"
              />
            </div>

            <Button
              className="w-full bg-amber-500 text-black transition-colors duration-200 hover:bg-amber-400"
              onClick={() => {
                setStatus("adjust");
                setDrawer(false);
                setNote("");
                setSelected("");
              }}
            >
              Enviar solicitação de ajustes
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DecisionButton({
  onClick, disabled, tone, icon, label,
}: {
  onClick: () => void;
  disabled: boolean;
  tone: "emerald" | "amber" | "red" | "slate";
  icon: React.ReactNode;
  label: string;
}) {
  const toneMap = {
    emerald:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:glow-good",
    amber:
      "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:border-amber-500/50 hover:glow-warn",
    red:
      "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-500/50 hover:glow-bad",
    slate:
      "border-white/10 bg-white/[0.03] text-foreground hover:bg-white/[0.06] hover:border-white/20",
  } as const;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${toneMap[tone]}`}
    >
      <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>
      {label}
    </button>
  );
}