/**
 * Fonte canônica (não-React) do workspace ativo.
 *
 * O `ActiveContextProvider` continua sendo a autoridade do contexto: ele
 * publica aqui todo valor que resolve. Código que roda fora da árvore React
 * (ex.: `beforeLoad` das rotas / feature gate) lê deste registro em vez de ler
 * `localStorage`, que é apenas persistência auxiliar de preferência.
 *
 * `resolved` distingue "ainda não sabemos qual é o workspace" de "não existe
 * workspace" — sem isso, o gate classifica inicialização como bloqueio.
 */
export type ActiveWorkspaceState = {
  brandId: string | null;
  /** true quando o contexto já terminou de resolver o workspace ativo. */
  resolved: boolean;
};

let state: ActiveWorkspaceState = { brandId: null, resolved: false };
const listeners = new Set<(s: ActiveWorkspaceState) => void>();

function emit(): void {
  for (const fn of [...listeners]) fn(state);
}

export function getActiveWorkspace(): ActiveWorkspaceState {
  return state;
}

/** Publicado pelo contexto React quando o workspace ativo é resolvido. */
export function publishActiveWorkspace(brandId: string | null, resolved = true): void {
  if (state.brandId === brandId && state.resolved === resolved) return;
  state = { brandId, resolved };
  emit();
}

/** Transição de identidade: o workspace volta a ser "indefinido". */
export function markActiveWorkspaceUnresolved(): void {
  state = { brandId: null, resolved: false };
  emit();
}

export function subscribeActiveWorkspace(fn: (s: ActiveWorkspaceState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Aguarda a resolução do workspace (evita a race em que o gate roda antes do
 * contexto carregar e conclui "sem workspace"). Nunca prende a navegação: após
 * o timeout devolve o estado atual como está.
 */
export function waitForActiveWorkspace(timeoutMs = 3_000): Promise<ActiveWorkspaceState> {
  if (state.resolved) return Promise.resolve(state);
  return new Promise((resolve) => {
    let done = false;
    const finish = (s: ActiveWorkspaceState) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(s);
    };
    const unsub = subscribeActiveWorkspace((s) => {
      if (s.resolved) finish(s);
    });
    const timer = setTimeout(() => finish(state), timeoutMs);
  });
}

/** Apenas para testes. */
export function __resetActiveWorkspace(): void {
  state = { brandId: null, resolved: false };
  listeners.clear();
}
