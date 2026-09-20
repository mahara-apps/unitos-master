import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { ControlPlaneRepairPlan } from "@/components/installations/control-plane-repair-plan";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getControlPlaneRepairReportFn } from "@/lib/installation/control-plane-repair.functions";

export const Route = createFileRoute("/_authenticated/admin/instalacoes/reparacao")({
  component: ControlPlaneRepairPage,
  head: () => ({
    meta: [
      { title: "Reparação do Control-plane · Administração Unitos" },
      {
        name: "description",
        content:
          "Plano controlado e somente leitura para reparar o Control-plane do Unitos Master.",
      },
      { property: "og:title", content: "Reparação do Control-plane · Administração Unitos" },
      {
        property: "og:description",
        content: "Bloqueios, pré-requisitos e ordem segura do bootstrap do Control-plane.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ControlPlaneRepairPage() {
  const reportFn = useServerFn(getControlPlaneRepairReportFn);
  const report = useQuery({
    queryKey: ["control-plane-repair-plan", "1.4.18"],
    queryFn: () => reportFn(),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (report.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparando relatório local…
      </div>
    );
  }

  if (report.isError || !report.data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Relatório indisponível — execução bloqueada</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Não foi possível comprovar o plano e a autoridade. Nenhuma alteração foi executada.
          </p>
          <Button size="sm" variant="outline" onClick={() => void report.refetch()}>
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Button asChild size="sm" variant="ghost" className="-ml-2">
        <Link to="/admin/instalacoes">
          <ArrowLeft className="h-4 w-4" /> Instalações
        </Link>
      </Button>
      <ControlPlaneRepairPlan report={report.data} />
    </div>
  );
}
