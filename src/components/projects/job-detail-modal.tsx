/**
 * Janela central do JOB — mesma anatomia da referência de gestão de projetos:
 *   [Concluir] [responsável] [datas] [status] ⋮ ✕
 *   Título                                    Cliente › Projeto
 *   ┌ tarefas / briefing ──────┬ abas de contexto ┐
 * Componente apenas de apresentação: conteúdo e ações vêm por slots.
 */
import type { ReactNode } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function JobDetailModal({
  open,
  onOpenChange,
  title,
  breadcrumb,
  done = false,
  onToggleDone,
  controls,
  menu,
  main,
  aside,
  timeline,
  code,
  collaborators,
  share,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  breadcrumb?: ReactNode;
  done?: boolean;
  onToggleDone?: () => void;
  /** Responsável, status e datas. */
  controls?: ReactNode;
  menu?: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
  timeline?: ReactNode;
  code?: string;
  collaborators?: ReactNode;
  share?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(920px,calc(100dvh-32px))] w-[calc(100vw-24px)] max-w-[1440px] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:w-[calc(100vw-48px)]">
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <header className="shrink-0 border-b border-border/60 bg-background pr-12">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 px-5 pb-4 pt-5 sm:px-6">
            <div className="min-w-0">
              <div className="mb-1.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                <span className="shrink-0 font-mono">{code}</span>
                {breadcrumb ? <><span aria-hidden="true">·</span><div className="flex min-w-0 items-center gap-1.5">{breadcrumb}</div></> : null}
              </div>
              <h2 className="truncate text-xl font-semibold leading-tight sm:text-2xl">{title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">{collaborators}{share}{menu}</div>
          </div>

          <div className="grid gap-3 border-t border-border/50 bg-muted/20 px-5 py-3 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            {onToggleDone ? (
              <Button size="sm" variant={done ? "secondary" : "default"} className="h-9 w-fit gap-1.5 px-4" onClick={onToggleDone}>
                {done ? <><RotateCcw className="h-3.5 w-3.5" /> Reabrir</> : <><CheckCircle2 className="h-3.5 w-3.5" /> Concluir</>}
              </Button>
            ) : null}
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(150px,1fr)_minmax(130px,1fr)_auto_auto]">{controls}</div>
          </div>
        </header>

        {timeline ? <div className="shrink-0 border-b border-border/60 px-5 py-3 sm:px-6">{timeline}</div> : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)] lg:overflow-hidden">
          <div className="min-h-0 min-w-0 lg:overflow-y-auto lg:border-r lg:border-border/60">
            {main}
          </div>
          {aside ? <aside className="flex min-h-[420px] min-w-0 flex-col border-t border-border/60 bg-muted/10 lg:min-h-0 lg:border-t-0">{aside}</aside> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
