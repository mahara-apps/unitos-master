import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cache de sessão do usuário (performance de navegação).
 *
 * `supabase.auth.getUser()` faz roundtrip de rede a cada chamada. Como o gate
 * do layout `_authenticated` roda em toda navegação — e vários componentes
 * pedem o usuário no mount — sem cache cada troca de tela paga 1+ requisição
 * serial antes de renderizar. Aqui deduplicamos por TTL curto, mantendo o
 * mesmo resultado funcional (token continua sendo validado no servidor).
 */
const TTL_MS = 60_000;

let cached: { user: User | null; at: number } | null = null;
let inflight: Promise<User | null> | null = null;

/** Timeout do gate: rede lenta/lock travado não pode prender a navegação. */
const TIMEOUT_MS = 6_000;
/** Limite da leitura de reserva (sessão local), que disputa o mesmo lock. */
const LOCAL_TIMEOUT_MS = 2_000;

/**
 * Não foi possível confirmar a sessão a tempo. É diferente de "sem sessão"
 * (null): não redireciona nem desloga sozinho; a tela oferece recuperação.
 */
export class AuthCheckTimeoutError extends Error {
  constructor(readonly waitedMs: number) {
    super("auth_check_timeout");
    this.name = "AuthCheckTimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<typeof TIMED_OUT>((r) => {
    t = setTimeout(() => r(TIMED_OUT), ms);
  });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}
const TIMED_OUT = Symbol("timed_out");

async function resolveUser(): Promise<User | null> {
  const started = Date.now();
  const remote = supabase.auth
    .getUser()
    .then(({ data, error }) => (error ? null : (data.user ?? null)))
    .catch(() => null);

  const raced = await withTimeout(remote, TIMEOUT_MS);
  if (raced !== TIMED_OUT) return raced;

  // Fallback local: sessão já persistida (o servidor revalida o bearer em toda
  // chamada protegida). Também limitado — antes podia esperar para sempre.
  const local = supabase.auth
    .getSession()
    .then(({ data }) => data.session?.user ?? null)
    .catch(() => null);
  const fallback = await withTimeout(local, LOCAL_TIMEOUT_MS);
  if (fallback !== TIMED_OUT) {
    console.warn("[auth] validação remota excedeu o limite; usando sessão local", {
      waitedMs: Date.now() - started,
    });
    return fallback;
  }
  const waitedMs = Date.now() - started;
  console.warn("[auth] não foi possível confirmar a sessão (getUser e getSession travados)", {
    waitedMs,
  });
  throw new AuthCheckTimeoutError(waitedMs);
}

export async function getCachedUser(options?: { force?: boolean }): Promise<User | null> {
  if (!options?.force && cached && Date.now() - cached.at < TTL_MS) return cached.user;
  if (!options?.force && inflight) return inflight;

  inflight = (async () => {
    try {
      const user = await resolveUser();
      cached = { user, at: Date.now() };
      return user;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Invalida o cache — chamado em qualquer transição de identidade. */
/** Sessão local presa: limpa só este navegador para permitir novo login. */
export async function resetLocalSession(): Promise<void> {
  clearCachedUser();
  await withTimeout(supabase.auth.signOut({ scope: "local" }).catch(() => null), 3_000);
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) window.localStorage.removeItem(k);
    }
  } catch {
    /* storage indisponível */
  }
}

export function clearCachedUser(): void {
  cached = null;
  inflight = null;
}

export const authUserQueryOptions = () => ({
  queryKey: ["auth", "user"] as const,
  queryFn: () => getCachedUser(),
  staleTime: TTL_MS,
});
