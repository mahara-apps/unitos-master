import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => (
    <ComingSoon
      title="Relatórios"
      description="Relatórios executivos consolidados por conta, período e canal."
    />
  ),
});