import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients } from "@/lib/workspace.functions";
import { usePageHeader } from "@/hooks/use-page-header";

export const Route = createFileRoute("/_authenticated/customers/$customerId/pipeline")({
  component: CustomerPipeline,
});

const STAGES = ["Briefing", "Redação", "Design", "Revisão", "Aprovado", "Agendado"] as const;

function CustomerPipeline() {
  const { customerId } = Route.useParams();
  const { brandId } = useActiveContext();
  const list = useServerFn(listClients);
  const customersQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });
  const customer = (customersQ.data ?? []).find((c) => c.id === customerId);

  usePageHeader(
    {
      title: `${customer?.name ?? "Cliente"} · Pipeline`,
      subtitle: "Visão focada do pipeline de produção deste cliente.",
      actions: (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            {customerId.slice(0, 8)}
          </Badge>
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5">
            <Link to="/customers/$customerId" params={{ customerId }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Link>
          </Button>
        </div>
      ),
    },
    [customer?.name, customerId],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {STAGES.map((s) => (
          <div
            key={s}
            className="flex w-72 shrink-0 flex-col rounded-lg border border-border/60 bg-card/40"
          >
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="text-xs font-medium">{s}</div>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                0
              </Badge>
            </div>
            <div className="flex flex-1 items-center justify-center p-6 text-[11px] text-muted-foreground">
              Nenhum post neste estágio.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}