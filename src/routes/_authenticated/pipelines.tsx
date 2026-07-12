import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/pipelines")({
  component: () => (
    <ComingSoon
      title="Pipelines"
      description="Encadeamentos de agentes e etapas de produção reutilizáveis."
    />
  ),
});