import { getMyPortalAccessFn, type PortalAccess } from "@/lib/portal-access.functions";
import { requireFeatureAccess } from "@/lib/feature-flags.functions";

/**
 * Caches de gate de navegação (somente performance — nenhuma regra muda).
 *
 * Os gates de `beforeLoad` (portal x equipe, feature habilitada) rodavam a
 * cada navegação, encadeando roundtrips seriais antes de qualquer pixel da
 * nova tela. Aqui memorizamos o resultado por TTL curto e deduplicamos
 * chamadas concorrentes; o bloqueio real continua idêntico e o servidor segue
 * sendo a autoridade.
 */
const TTL_MS = 5 * 60_000;

type Entry<T> = { value: T; at: number };

function memo<T>(ttl = TTL_MS) {
  const store = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();
  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && Date.now() - hit.at < ttl) return hit.value;
      const running = inflight.get(key);
      if (running) return running;
      const p = (async () => {
        try {
          const value = await load();
          store.set(key, { value, at: Date.now() });
          return value;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    },
    clear() {
      store.clear();
      inflight.clear();
    },
  };
}

const portalAccessCache = memo<PortalAccess | null>();
const featureGateCache = memo<boolean>();

export function getCachedPortalAccess(): Promise<PortalAccess | null> {
  return portalAccessCache.get("me", () => getMyPortalAccessFn().catch(() => null));
}

export function getCachedFeatureEnabled(
  brandId: string | null,
  featureKey: string,
): Promise<boolean> {
  return featureGateCache.get(`${brandId ?? "none"}:${featureKey}`, async () => {
    const { enabled } = await requireFeatureAccess({ data: { brandId, featureKey } });
    return enabled;
  });
}

/** Chamado ao alternar features ou trocar de identidade. */
export function clearAccessCaches(): void {
  portalAccessCache.clear();
  featureGateCache.clear();
}
