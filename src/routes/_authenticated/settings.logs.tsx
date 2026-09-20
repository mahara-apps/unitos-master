import { createFileRoute } from "@tanstack/react-router";

import { usePageHeader } from "@/hooks/use-page-header";
import { LogViewer } from "@/components/system-logs/log-viewer";

export const Route = createFileRoute("/_authenticated/settings/logs")({
  head: () => ({
    meta: [
      { title: "Auditoria | Configurações | Unitos" },
      { name: "description", content: "Consulte o histórico de ações realizadas no workspace." },
      { property: "og:title", content: "Auditoria | Configurações | Unitos" },
      {
        property: "og:description",
        content: "Consulte o histórico de ações realizadas no workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LogsPage,
});

/**
 * Central de auditoria operacional e humana do workspace.
 */
function LogsPage() {
  usePageHeader({
    title: "Auditoria",
    subtitle: "Saúde operacional, falhas e ações do workspace",
  });

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <LogViewer
        queryKey="settings-system-audit"
        sources={["system", "critical_action", "activity", "message", "ai_job"]}
        title="Eventos do sistema"
        description="Sistema, ações, mensagens e IA, com origem e integridade de cada fonte."
      />
    </div>
  );
}
