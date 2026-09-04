/**
 * Decide o que fazer quando o servidor devolve uma versão do briefing
 * diferente da que originou o formulário em tela (ex.: importação por IA).
 *
 * - `apply`: substitui os campos pela versão do servidor.
 * - `prompt`: existe edição local não salva — pergunta antes de sobrescrever.
 * - `keep`: nada mudou; mantém o formulário atual.
 */
export type BriefingSyncDecision = "apply" | "prompt" | "keep";

export function decideBriefingFormSync(args: {
  /** Formulário já montado em tela. */
  hasForm: boolean;
  /** Existem edições locais não salvas. */
  dirty: boolean;
  /** updated_at retornado pelo servidor. */
  serverVersion: string | null;
  /** updated_at que originou o formulário atual. */
  syncedVersion: string | null;
}): BriefingSyncDecision {
  if (!args.hasForm) return "apply";
  if (args.serverVersion === args.syncedVersion) return "keep";
  return args.dirty ? "prompt" : "apply";
}
