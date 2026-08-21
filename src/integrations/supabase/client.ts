import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Cliente Supabase do navegador.
 *
 * A instância é resolvida SOMENTE por variáveis de ambiente, para que cada
 * instalação (agência) aponte para o seu próprio projeto Supabase sem nenhuma
 * credencial fixa no código. No Vite/TanStack Start o build injeta
 * `import.meta.env.VITE_*`; durante o SSR (Vercel/Worker) também aceitamos os
 * equivalentes sem prefixo, disponíveis em `process.env`.
 */
function readEnv(...keys: string[]): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const nodeEnv: Record<string, string | undefined> =
    typeof process !== "undefined" && process.env ? process.env : {};
  for (const key of keys) {
    const value = viteEnv[key] ?? nodeEnv[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

const SUPABASE_URL = readEnv("VITE_SUPABASE_URL", "SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = readEnv(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
);

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // Sem env configurada não existe conexão possível — falhar explicitamente é
  // melhor do que cair silenciosamente em outro projeto.
  const missing = [
    ...(!SUPABASE_URL ? ["VITE_SUPABASE_URL"] : []),
    ...(!SUPABASE_PUBLISHABLE_KEY ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
  ].join(", ");
  throw new Error(
    `Configuração do Supabase ausente (${missing}). Defina as variáveis de ambiente do projeto.`,
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

/**
 * O lock padrão do supabase-js usa Web Locks, que são compartilhados por
 * origem. Em iframes de preview (ou com a mesma aba aberta duas vezes) um lock
 * preso faz `getSession()`/`getUser()` nunca resolver — a tela fica no spinner
 * para sempre. Usamos um lock pass-through no navegador para evitar o deadlock.
 */
const passThroughLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => fn();

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    lock: passThroughLock,
  },
});
