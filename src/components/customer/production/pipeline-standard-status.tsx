import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { getProductionPipelineStatusFn } from "@/lib/production-stages.functions";
import { describeError } from "@/lib/errors";

export function PipelineStandardStatus({ pipelineId }: { pipelineId: string }) {
  const get = useServerFn(getProductionPipelineStatusFn);
  const q = useQuery({ queryKey: ["production-pipeline-status", pipelineId], queryFn: () => get({ data: { pipelineId } }) });
  if (q.isError) return <p className="text-sm text-destructive">Não foi possível conferir o padrão: {describeError(q.error)}</p>;
  if (!q.data || !q.data.primary) return null;
  return <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
    <Badge variant="outline">Definido pelo workspace</Badge>
    <Badge variant="secondary">{q.data.equal ? "Igual ao padrão" : "Aguardando aplicação do padrão"}</Badge>
    <Link to="/settings/work-statuses" className="text-xs text-primary underline underline-offset-2">Editar em Status de trabalho</Link>
  </div>;
}
