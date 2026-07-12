import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/work")({
  component: () => (
    <ComingSoon
      title="Trabalho"
      description="Sua central de trabalho diário: tarefas atribuídas, entregas e follow-ups em um único lugar."
    />
  ),
});