import { createFileRoute } from "@tanstack/react-router";
import { usePageHeader } from "@/hooks/use-page-header";
import { BrainDashboard } from "@/components/brain/brain-dashboard";
import { ensureFeatureEnabled } from "@/lib/feature-flags.gate";
import { useActiveContext } from "@/hooks/use-active-context";

export const Route = createFileRoute("/_authenticated/brain")({
  beforeLoad: () => ensureFeatureEnabled("brain"),
  component: BrainRoute,
});

function BrainRoute() {
  usePageHeader(
    {
      title: "Brain",
      subtitle: "Memória viva da agência — a IA aprendendo com cada evento.",
    },
    [],
  );
  const { brandId, clientId } = useActiveContext();
  return <BrainDashboard brandId={brandId} clientId={clientId} lockClient={!!clientId} />;
}