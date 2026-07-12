import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/referrals")({
  component: () => (
    <ComingSoon
      title="Indique e ganhe"
      description="Convide outras agências e ganhe créditos ao ativarem a NexusFlow."
    />
  ),
});