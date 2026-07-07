import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, MessageSquareWarning, X, MessageCircle, Calendar, Instagram, Sparkles } from "lucide-react";

export const Route = createFileRoute("/portal/$token")({
  component: PortalPage,
  head: () => ({
    meta: [
      { title: "Aprovação de conteúdo · NexusFlow" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PortalPage() {
  const [modal, setModal] = useState<null | "adjust" | "comment">(null);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "adjust">("pending");
  const [note, setNote] = useState("");

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%),hsl(var(--background))] text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
            <span className="text-xs font-bold">V</span>
          </div>
          <div>
            <div className="text-sm font-semibold">Vitta Saúde</div>
            <div className="text-[10px] text-muted-foreground">portal de aprovação</div>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Link único · expira em 7 dias
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <div className="mb-6 text-center">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Post 04 de 12 · Semana 28
          </div>
          <h1 className="text-2xl font-semibold">Aprove o próximo post</h1>
          <p className="mt-1 text-xs text-muted-foreground">Revise a arte e a legenda abaixo. Sua resposta chega instantaneamente à equipe.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur">
          {/* Art */}
          <div className="relative aspect-[4/5] bg-gradient-to-br from-emerald-950/60 via-background to-emerald-900/30">
            <div className="absolute inset-0 flex flex-col justify-between p-8">
              <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-300/70">Vitta · educativo</div>
              <div>
                <div className="text-4xl font-bold leading-tight text-emerald-50">
                  3 erros de LGPD<br/>que podem custar<br/>caro à sua clínica
                </div>
                <div className="mt-4 text-xs text-emerald-200/70">arraste →</div>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 flex h-10 w-20 items-center justify-center rounded border border-emerald-400/40 bg-background/50 text-[9px] text-emerald-300/70">
              logo
            </div>
          </div>

          {/* Meta */}
          <div className="border-t border-border/60 px-6 py-4">
            <div className="mb-3 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Instagram className="h-3 w-3" /> Instagram · Carrossel 6 slides</span>
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Publicação prevista: <strong className="text-foreground">qui, 09/07 · 09h</strong></span>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-4 text-sm leading-relaxed">
              <p className="mb-2 font-medium">🔒 3 erros de LGPD que podem custar caro à sua clínica</p>
              <p className="text-muted-foreground">
                A maioria das clínicas ainda armazena prontuários em pastas compartilhadas — e isso já rendeu autuações de R$ 50k+ em 2025.
                <br/><br/>
                No carrossel: os 3 erros mais comuns, o que a ANPD fiscaliza primeiro e o checklist gratuito que a nossa equipe montou.
                <br/><br/>
                Salve esse post — você vai precisar dele antes da próxima auditoria.
              </p>
            </div>
          </div>

          {/* Actions */}
          {status === "pending" ? (
            <div className="grid grid-cols-2 gap-2 border-t border-border/60 bg-background/30 p-3 sm:grid-cols-4">
              <Button onClick={() => setStatus("approved")} className="gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600">
                <Check className="h-4 w-4" /> Aprovar
              </Button>
              <Button onClick={() => setModal("adjust")} className="gap-1.5 bg-amber-500 text-black hover:bg-amber-600">
                <MessageSquareWarning className="h-4 w-4" /> Pedir ajustes
              </Button>
              <Button onClick={() => setStatus("rejected")} variant="destructive" className="gap-1.5">
                <X className="h-4 w-4" /> Rejeitar
              </Button>
              <Button onClick={() => setModal("comment")} variant="outline" className="gap-1.5">
                <MessageCircle className="h-4 w-4" /> Comentar
              </Button>
            </div>
          ) : (
            <div className="border-t border-border/60 bg-background/30 p-6 text-center">
              <div className="text-sm">
                {status === "approved" && <span className="text-emerald-400">✓ Post aprovado — a equipe foi notificada.</span>}
                {status === "rejected" && <span className="text-red-400">✗ Post rejeitado — vamos preparar uma nova versão.</span>}
                {status === "adjust" && <span className="text-amber-400">↻ Ajustes solicitados — voltamos em breve com a revisão.</span>}
              </div>
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setStatus("pending")}>Voltar</Button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-[10px] text-muted-foreground">
          Powered by <span className="font-medium text-foreground">NexusFlow</span>
        </div>
      </main>

      <Dialog open={modal !== null} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal === "adjust" ? "Descreva os ajustes" : "Deixe um comentário"}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={modal === "adjust" ? "Ex.: 'A legenda ficou longa, poderia ter um CTA mais forte no final.'" : "Compartilhe qualquer observação com a equipe…"}
            className="min-h-[120px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (modal === "adjust") setStatus("adjust");
                setModal(null);
                setNote("");
              }}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}