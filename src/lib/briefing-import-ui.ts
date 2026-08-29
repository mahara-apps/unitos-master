/**
 * Lógica pura da experiência de "Importar Briefing via IA".
 *
 * Toda regra de negócio real (fingerprint, run, proposta, apply) vive em
 * `briefing-import.server.ts`. Aqui ficam apenas as decisões de apresentação:
 * validação do arquivo antes do upload, máquina de estados do modal, rótulos
 * e agregações usadas pela revisão e pelo histórico.
 */

import type {
  ImportChangeAction,
  ImportChangeRow,
  ImportRunStatus,
  ImportSourceKind,
  ImportStep,
} from "@/lib/briefing-import.server";

/* --------------------------- Arquivos aceitos --------------------------- */

/** Limite por arquivo — mesmo do uploader de Documentos & Contexto. */
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Formatos que o pipeline atual realmente consegue interpretar: PDF e imagens
 * vão direto na chamada multimodal; texto puro (txt/md/csv/json) é legível como
 * arquivo. Formatos Office binários (.docx/.pptx/.xlsx) NÃO são suportados —
 * não prometemos o que o backend não lê.
 */
export const ACCEPTED_IMPORT_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".vtt",
  ".srt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const;

export const ACCEPT_ATTRIBUTE = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  ...ACCEPTED_IMPORT_EXTENSIONS,
].join(",");

export type FileValidation = { ok: true } | { ok: false; reason: string };

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export function validateImportFile(file: { name: string; size: number }): FileValidation {
  const ext = extensionOf(file.name);
  if (!ACCEPTED_IMPORT_EXTENSIONS.includes(ext as (typeof ACCEPTED_IMPORT_EXTENSIONS)[number])) {
    return {
      ok: false,
      reason: `Formato não suportado (${ext || "sem extensão"}). Use PDF, texto (.txt/.md/.csv/.json), legenda (.vtt/.srt) ou imagem.`,
    };
  }
  if (file.size <= 0) return { ok: false, reason: "Arquivo vazio." };
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, reason: "Arquivo excede o limite de 25 MB." };
  }
  return { ok: true };
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------ Origem ------------------------------ */

const TRANSCRIPT_HINTS = [
  "transcri",
  "transcript",
  "reuniao",
  "reunião",
  "meeting",
  "call",
  "ata",
  "gravacao",
  "gravação",
];

/**
 * Infere a origem a partir do nome do arquivo. Só distingue transcrição de
 * documento: o backend preserva `source_kind`, e a extração de participantes
 * fica como ponto de extensão (ver `speakers` em `briefing_import_runs`).
 */
export function inferSourceKind(filename: string): Extract<ImportSourceKind, "document" | "transcript"> {
  const lower = filename.toLowerCase();
  const ext = extensionOf(lower);
  if (ext === ".vtt" || ext === ".srt") return "transcript";
  return TRANSCRIPT_HINTS.some((h) => lower.includes(h)) ? "transcript" : "document";
}

export const SOURCE_KIND_LABELS: Record<ImportSourceKind, string> = {
  document: "Documento",
  transcript: "Transcrição de reunião",
  paste: "Texto colado",
  url: "Link",
};

/* --------------------------- Máquina de estados --------------------------- */

export type ImportUiStep = "upload" | "analyzing" | "review" | "applied" | "failed";

/** Estado do modal derivado exclusivamente do status real da run. */
export function uiStepFromRun(status: ImportRunStatus | null | undefined): ImportUiStep {
  switch (status) {
    case "queued":
    case "running":
      return "analyzing";
    case "proposed":
    case "applying":
      return "review";
    case "applied":
      return "applied";
    case "failed":
      return "failed";
    default:
      return "upload";
  }
}

/** A run deve continuar sendo consultada enquanto a IA trabalha. */
export function shouldPollRun(status: ImportRunStatus | null | undefined): boolean {
  return status === "queued" || status === "running" || status === "applying";
}

export const STEP_LABELS: Record<ImportStep, string> = {
  ingest: "Leitura do arquivo",
  extract: "Extração de conteúdo",
  interpret: "Interpretação pela IA",
  diff: "Comparação com o briefing atual",
  propose: "Proposta de alterações",
  apply: "Aplicação no briefing",
};

export const RUN_STATUS_LABELS: Record<ImportRunStatus, string> = {
  queued: "Na fila",
  running: "Analisando",
  proposed: "Aguardando revisão",
  applying: "Aplicando",
  applied: "Aplicado",
  failed: "Falhou",
  cancelled: "Cancelado",
  discarded: "Descartado",
};

/* ---------------------------- Revisão de campos ---------------------------- */

export const BRIEFING_FIELD_LABELS: Record<string, string> = {
  description: "Descrição da marca",
  mission: "Missão",
  positioning: "Posicionamento",
  values: "Valores",
  audience: "Público-alvo",
  pain_points: "Dores",
  demographics: "Demografia",
  offer: "Oferta / Produto",
  differentials: "Diferenciais",
  objections: "Objeções",
  journey: "Jornada",
  desires: "Desejos",
  tone_text: "Tom de voz",
  hashtags: "Hashtags",
  goals: "Metas",
};

export function fieldLabel(field: string): string {
  return BRIEFING_FIELD_LABELS[field] ?? field;
}

export type ChangeState = "new" | "update" | "conflict" | "unchanged" | "empty";

/** Confiança abaixo deste piso em cima de conteúdo existente = conflito. */
export const CONFLICT_CONFIDENCE_FLOOR = 0.5;

/**
 * Classifica a mudança para a UI. "Conflito" é uma sobrescrita de conteúdo
 * existente com baixa confiança (ou marcada como conflito pela evidência) —
 * ela nunca é aceita por padrão.
 */
export function changeState(change: {
  action: ImportChangeAction;
  confidence: number | null;
  evidence?: Record<string, unknown> | null;
}): ChangeState {
  if (change.action === "create") return "new";
  if (change.action === "keep") return "unchanged";
  if (change.action === "discard") return "empty";
  const flagged = change.evidence?.["conflict"] === true;
  const lowConfidence = typeof change.confidence === "number" && change.confidence < CONFLICT_CONFIDENCE_FLOOR;
  return flagged || lowConfidence ? "conflict" : "update";
}

export const CHANGE_STATE_LABELS: Record<ChangeState, string> = {
  new: "Novo",
  update: "Atualização",
  conflict: "Conflito",
  unchanged: "Sem alteração",
  empty: "Sem conteúdo",
};

/** Somente mudanças reais entram na revisão. */
export function isReviewable(action: ImportChangeAction): boolean {
  return action === "create" || action === "update";
}

/**
 * Pré-seleção da revisão: novidades e atualizações confiáveis vêm marcadas;
 * conflitos exigem decisão explícita do usuário.
 */
export function defaultSelection(changes: ImportChangeRow[]): Set<string> {
  const selected = new Set<string>();
  for (const c of changes) {
    if (!isReviewable(c.action)) continue;
    if (changeState(c) === "conflict") continue;
    if (c.decision === "rejected") continue;
    selected.add(c.field);
  }
  return selected;
}

export type ReviewSummary = {
  reviewable: number;
  novos: number;
  atualizacoes: number;
  conflitos: number;
  semAlteracao: number;
};

export function summarizeChanges(changes: ImportChangeRow[]): ReviewSummary {
  const summary: ReviewSummary = {
    reviewable: 0,
    novos: 0,
    atualizacoes: 0,
    conflitos: 0,
    semAlteracao: 0,
  };
  for (const c of changes) {
    const state = changeState(c);
    if (isReviewable(c.action)) summary.reviewable += 1;
    if (state === "new") summary.novos += 1;
    else if (state === "update") summary.atualizacoes += 1;
    else if (state === "conflict") summary.conflitos += 1;
    else summary.semAlteracao += 1;
  }
  return summary;
}

/** Texto legível de qualquer valor de briefing (string, array, objeto). */
export function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function confidenceLabel(confidence: number | null | undefined): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return `${Math.round(confidence * 100)}% de confiança`;
}

/** Mensagem de erro amigável para as falhas conhecidas da camada de import. */
export function importErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const map: Record<string, string> = {
    import_run_not_found: "Execução não encontrada.",
    import_run_not_reviewable: "Esta execução não está mais em revisão.",
    import_run_not_applicable: "Esta execução não pode mais ser aplicada.",
    import_run_apply_in_progress: "A aplicação já está em andamento.",
    import_run_not_retryable: "Só execuções com falha podem ser reprocessadas.",
    no_accepted_fields: "Selecione ao menos um campo para aplicar.",
    document_not_analyzed: "O documento ainda não foi interpretado pela IA.",
  };
  for (const [key, message] of Object.entries(map)) {
    if (raw.includes(key)) return message;
  }
  if (/unauthorized|forbidden|permission|denied|rls/i.test(raw)) {
    return "Você não tem permissão para importar o briefing deste cliente.";
  }
  return raw || "Falha na importação.";
}
