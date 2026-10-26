import { AlertTriangle } from "lucide-react";
import { deriveAiHealthWarnings, type ProviderPanelEntry } from "@/lib/ai-provider-health";

/** Avisos de provedor principal/chave/crédito para administradores. */
export function AiHealthBanner({
  primary,
  providers,
}: {
  primary?: string | null;
  providers?: Record<string, ProviderPanelEntry> | null;
}) {
  const warnings = deriveAiHealthWarnings({ primary, providers });
  if (!warnings.length) return null;
  return (
    <div className="space-y-2" role="alert">
      {warnings.map((w) => (
        <div
          key={`${w.kind}-${w.provider ?? ""}`}
          className={
            w.severity === "error"
              ? "flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
          }
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}
