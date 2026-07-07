import { createFileRoute } from "@tanstack/react-router";
import { useActiveContext } from "@/hooks/use-active-context";
import { SwotTab, useClientContext } from "@/components/ai-agents/agent-tabs";

export const Route = createFileRoute("/_authenticated/app/clients/$clientId/swot")({
  component: Page,
});

function Page() {
  const { clientId } = Route.useParams();
  const { brandId } = useActiveContext();
  const { ctx, invalidate } = useClientContext(brandId ?? "", clientId);
  if (!brandId) return null;
  return <SwotTab brandId={brandId} clientId={clientId} ctx={ctx} onDone={invalidate} />;
}