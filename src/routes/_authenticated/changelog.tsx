import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/changelog")({
  component: () => (
    <ComingSoon
      title="Novidades"
      description="Acompanhe as atualizações mais recentes da plataforma."
    />
  ),
});