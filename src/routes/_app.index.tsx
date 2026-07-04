import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  component: Index,
});

function Index() {
  return (
    <div className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden bg-background px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,theme(colors.violet.500/15),transparent_60%),radial-gradient(circle_at_80%_60%,theme(colors.indigo.500/15),transparent_60%)]" />
      <div className="relative z-10 max-w-2xl text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          NexusFlow — produção de conteúdo com IA
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Do briefing à publicação, num só fluxo.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Kanban de aprovação, IA para copy e imagem, e visibilidade total do processo.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/production"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Abrir produção <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
