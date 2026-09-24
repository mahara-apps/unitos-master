import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createRememberStorage } from "./remember-storage";
import { resolveBrowserSupabaseConfig } from "./client-config";

/**
 * Cliente Supabase do navegador.
 *
 * A instância é resolvida SOMENTE por variáveis de ambiente, para que cada
 * instalação (agência) aponte para o seu próprio projeto Supabase sem nenhuma
 * credencial fixa no código. As referências precisam ser estáticas para que o
 * Vite injete `import.meta.env.VITE_*` no bundle do navegador.
 */
const browserConfig = resolveBrowserSupabaseConfig({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  legacyAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID,
});

export const supabaseConfigurationError = browserConfig.ok ? null : browserConfig.reason;

// A instância inválida existe apenas para manter imports determinísticos até a
// raiz renderizar o bloqueio controlado. Nenhuma tela pode usá-la: o root gate
// encerra a árvore antes dos efeitos e loaders protegidos.
const SUPABASE_URL = browserConfig.ok ? browserConfig.url : "https://configuration.invalid";
const SUPABASE_PUBLISHABLE_KEY = browserConfig.ok
  ? browserConfig.publishableKey
  : "configuration-missing";

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
    storage: createRememberStorage(),
    persistSession: true,
    autoRefreshToken: true,
    lock: passThroughLock,
  },
});
