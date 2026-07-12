import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/projects")({
  component: () => (
    <ComingSoon
      title="Projetos"
      description="Agrupe entregas em projetos com escopo, prazo e status."
    />
  ),
});