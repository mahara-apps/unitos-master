import { createFileRoute } from "@tanstack/react-router";
import { usePageHeader } from "@/hooks/use-page-header";
import { KnowledgeGraph } from "@/components/brain/knowledge-graph";
import { ensureFeatureEnabled } from "@/lib/feature-flags.gate";

export const Route = createFileRoute("/_authenticated/brain/graph")({
  beforeLoad: () => ensureFeatureEnabled("brain"),
  component: BrainGraphRoute,
});

function BrainGraphRoute() {
  usePageHeader(
    {
      title: "Knowledge Graph",
      subtitle:
        "Relações inferidas automaticamente pelo Learning Engine — sem IA, apenas eventos observados.",
    },
    [],
  );
  return (
    <div className="space-y-6 p-6">
      <KnowledgeGraph brandId={null} />
    </div>
  );
}