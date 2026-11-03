import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarRange, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPostNavLinksFn } from "@/lib/post-nav.functions";

/** "Ir para a tarefa" e "Ir para a pauta" dentro da peça (só quando o vínculo existe). */
export function PostNavShortcuts({ postId, onNavigate }: { postId: string; onNavigate?: () => void }) {
  const getLinks = useServerFn(getPostNavLinksFn);
  const { data } = useQuery({
    queryKey: ["post-nav-links", postId],
    queryFn: () => getLinks({ data: { postId } }),
    staleTime: 60_000,
  });
  if (!data?.task && !data?.plan) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {data.task ? (
        <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
          <Link
            to="/projects/$projectId"
            params={{ projectId: data.task.projectId }}
            search={data.task.jobId ? { job: data.task.jobId } : {}}
            onClick={onNavigate}
            title={data.task.title}
          >
            <ListChecks className="h-3.5 w-3.5" /> Ir para a tarefa
          </Link>
        </Button>
      ) : null}
      {data.plan ? (
        <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
          <Link to="/monthly-plan/$planId" params={{ planId: data.plan.planId }} onClick={onNavigate}>
            <CalendarRange className="h-3.5 w-3.5" /> Ir para a pauta
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
