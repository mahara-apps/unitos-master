import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { BriefingWorkspace } from "@/components/brand-hub/briefing-workspace";
import { usePageHeader } from "@/hooks/use-page-header";

export const Route = createFileRoute("/_authenticated/customers/$customerId/briefing")({
  component: CustomerBriefingRoute,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function CustomerBriefingRoute() {
  const { customerId } = Route.useParams();
  const { brandId } = useActiveContext();

  usePageHeader(
    {
      title: "Briefing",
      subtitle: "Estratégia, público e mercado do cliente.",
    },
    [customerId],
  );

  if (!brandId || !UUID_RE.test(brandId) || !UUID_RE.test(customerId)) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Contexto inválido — selecione um workspace e cliente.
        </div>
      </div>
    );
  }
  return <BriefingWorkspace brandId={brandId} clientId={customerId} />;
}