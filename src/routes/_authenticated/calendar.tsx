import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: () => (
    <ComingSoon
      title="Calendário"
      description="Visualize publicações, tarefas e marcos em uma agenda unificada."
    />
  ),
});