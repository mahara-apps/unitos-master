import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";

export const Route = createFileRoute("/_authenticated/ai")({
  component: AiEngineEntry,
});

function AiEngineEntry() {
  const { brandId, clientId } = useActiveContext();

  if (brandId && clientId) {
    return <Navigate to="/customers/$customerId" params={{ customerId: clientId }} replace />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border/60 bg-card/60 p-8 text-center shadow-sm backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold">Brand AI Engine</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione uma conta para iniciar o motor de estratégia com IA.
        </p>
        <Link
          to="/customers"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          Escolher conta
        </Link>
      </div>
    </div>
  );
}