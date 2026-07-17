// ⚠️ Brain Core — tipos e contrato compartilhado entre os módulos internos do Brain.
// Nenhum consumidor externo deve importar deste caminho. Use `src/lib/brain/api.ts`.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Contexto passado a todo módulo do Brain. Carrega o cliente Supabase já
 * autenticado (RLS aplicada como o usuário chamador) + escopo lógico.
 */
export interface BrainContext {
  supabase: SupabaseClient;
  userId: string;
  /** Escopo opcional: null significa "sistema/agência". */
  brandId?: string | null;
  clientId?: string | null;
}

/** Envelope canônico de evento publicado no Event Bus. */
export interface BrainEventInput {
  brand_id: string | null;
  client_id?: string | null;
  source_module: string;
  event_type: string;
  actor_id?: string | null;
  payload: Record<string, unknown>;
}

export interface BrainMemoryRow {
  topic: string;
  summary: string;
  confidence: number | null;
}

export interface BrainInsightRow {
  insight_type: string;
  description: string;
  confidence: number | null;
  expires_at?: string | null;
}

export interface SemanticMemoryHit {
  content_summary: string;
  similarity: number;
  event_type: string;
}

export interface BrainStats {
  posts?: number;
  tasks?: number;
  projects?: number;
  [key: string]: number | undefined;
}