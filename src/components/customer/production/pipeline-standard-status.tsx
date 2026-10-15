import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProductionPipelineStatusFn, markProductionExceptionFn } from "@/lib/production-stages.functions";
import { useAccessRole } from "@/hooks/use-access-role";
import { describeError } from "@/lib/errors";

export function PipelineStandardStatus({ pipelineId }: { pipelineId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getProductionPipelineStatusFn);
  const mark = useServerFn(markProductionExceptionFn);
  const { role } = useAccessRole();
  const q = useQuery({ queryKey: ["production-pipeline-status", pipelineId], queryFn: () => get({ data: { pipelineId } }) });
  const mutation = useMutation({ mutationFn: () => mark({ data: { pipelineId } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["production-pipeline-status", pipelineId] }); toast.success("Quadro marcado como exceção."); },
    onError: (e) => toast.error(describeError(e)) });
  if (q.isError) return <p className="text-sm text-destructive">Não foi possível conferir o padrão: {describeError(q.error)}</p>;
  if (!q.data || !q.data.primary) return null;
  return <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
    <Badge variant="outline">{q.data.follows ? "Segue padrão do workspace" : "Exceção deste cliente"}</Badge>
    <Badge variant="secondary">{q.data.equal ? "Igual ao padrão" : "Diferente do padrão"}</Badge>
    {role === "admin" && q.data.follows && <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Marcar como exceção</Button>}
    <Link to="/settings/production-rules" className="text-xs text-primary underline underline-offset-2">Padrão e prévia de aplicação</Link>
  </div>;
}