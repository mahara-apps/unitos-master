import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";

import { useActiveContext } from "@/hooks/use-active-context";
import { listAiCredentialAudit } from "@/lib/ai-credential-audit.functions";
import { formatDateTimeBr } from "@/lib/timezone";

const PROVIDER: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
};

const OP: Record<string, string> = {
  added: "Chave cadastrada",
  replaced: "Chave trocada",
  removed: "Chave removida",
  panel_added: "Apareceu no painel",
  panel_removed: "Saiu do painel",
  panel_changed: "Estado do painel mudou",
};

const SOURCE: Record<string, string> = {
  "connections.save": "Tela de Conexões (salvar)",
  "connections.test": "Tela de Conexões (testar)",
  "connections.remove": "Tela de Conexões (remover)",
  health_check: "Verificação automática",
  app: "Sistema (usuário logado)",
  system: "Sistema (sem usuário)",
  unknown: "Desconhecida",
};

/** Histórico de entrada e saída das chaves de IA do workspace. */
export function AiCredentialAuditPanel() {
  const { brandId } = useActiveContext();
  const listFn = useServerFn(listAiCredentialAudit);
  const q = useQuery({
    queryKey: ["ai-credential-audit", brandId],
    queryFn: () => listFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Chaves de IA</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Toda entrada, troca e remoção de chave de IA, com quem fez e de onde veio. A chave
        nunca é exibida — só os últimos 4 caracteres.
      </p>
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : q.error ? (
        <div className="text-sm text-destructive">Não foi possível carregar o histórico.</div>
      ) : !q.data?.length ? (
        <div className="text-sm text-muted-foreground">Nenhuma mudança registrada ainda.</div>
      ) : (
        <ul className="divide-y text-sm">
          {q.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-medium">{PROVIDER[r.provider] ?? r.provider}</span>
              <span>{OP[r.op] ?? r.op}</span>
              {r.masked_last4 && (
                <span className="font-mono text-xs text-muted-foreground">…{r.masked_last4}</span>
              )}
              {r.target === "panel" && r.connected_after != null && (
                <span className="text-xs text-muted-foreground">
                  {r.connected_after ? "conectado" : "não conectado"}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {r.actor_name ?? "sem usuário"} · {SOURCE[r.source] ?? r.source}
              </span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {formatDateTimeBr(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
