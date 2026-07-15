import { createFileRoute } from "@tanstack/react-router";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { BrainDashboard } from "@/components/brain/brain-dashboard";

export const Route = createFileRoute("/_authenticated/customers/$customerId/brain")({
  component: CustomerBrainRoute,
});

function CustomerBrainRoute() {
  const { brandId } = useActiveContext();
  usePageHeader(
    {
      title: "Brain do cliente",
      subtitle: "Memória semântica alimentando os agentes desta marca.",
    },
    [],
  );
  if (!brandId) {
    return <div className="p-8 text-sm text-muted-foreground">Selecione um workspace.</div>;
  }
  return <BrainDashboard brandId={brandId} />;
}