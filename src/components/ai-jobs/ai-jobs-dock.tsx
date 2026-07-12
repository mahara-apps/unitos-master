import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SiriOrb } from "@/components/ui/siri-orb";
import { useAiJobs } from "./ai-jobs-provider";
import { cn } from "@/lib/utils";

/**
 * Fixed bottom-right dock that surfaces active AI generations so the user
 * can navigate freely and still see the process running in the background.
 */
export function AiJobsDock() {
  const { active, dismiss } = useAiJobs();
  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-80 flex-col gap-2">
      {active.slice(0, 3).map((j) => (
        <div
          key={j.id}
          className={cn(
            "pointer-events-auto flex items-center gap-3 rounded-xl border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur",
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center">
            <SiriOrb size={40} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <div className="truncate text-xs font-medium">{j.title}</div>
            </div>
            <div className="mt-1 space-y-1">
              <Progress value={j.progress} className="h-1" />
              <div className="truncate text-[10px] text-muted-foreground">
                {j.step_label ?? "Processando em segundo plano..."}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label="Ocultar"
            onClick={() => void dismiss(j.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {active.length > 3 && (
        <div className="pointer-events-auto rounded-md bg-background/90 px-2 py-1 text-center text-[10px] text-muted-foreground shadow">
          +{active.length - 3} outras em execução
        </div>
      )}
    </div>
  );
}