// Tipos client-safe compartilhados pelo canal de e-mail (sem segredos).

/** Client Supabase mínimo necessário para ler a credencial da marca (RLS aplicada). */
export type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> };
      };
    };
  };
};
