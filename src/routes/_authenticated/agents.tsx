import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/agents")({
  component: () => (
    <ComingSoon
      title="Agentes IA"
      description="Configuração e monitoramento dos agentes de IA que compõem seus pipelines."
    />
  ),
});