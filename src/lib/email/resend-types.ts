// Tipos client-safe compartilhados pelo canal de e-mail (sem segredos).

/** Client Supabase mínimo necessário para ler a credencial da marca (RLS aplicada). */
export type SupabaseLike = {
  from: (table: string) => any;
};
