/**
 * Cache compartilhado de varredura da Meta (server-only).
 *
 * PROBLEMA que este módulo resolve: existiam DUAS trilhas independentes de
 * descoberta — `runMetaDiscovery` (aba "Contas disponíveis" / reconciliação) e
 * `getMetaPortfolio(refresh)` (modal de portfólios). Ao voltar do OAuth, ambas
 * disparavam praticamente ao mesmo tempo, cada uma varrendo TODOS os
 * portfólios: o consumo da Graph API dobrava sem nenhum ganho.
 *
 * Agora as duas passam por `runSharedScan`, que:
 *  - reutiliza o resultado de uma varredura recente (janela curta);
 *  - deduplica varreduras concorrentes (a segunda aguarda a primeira e NÃO
 *    gera requisição alguma);
 *  - emite uma linha de telemetria estruturada por varredura.
 *
 * Não altera OAuth, RLS, schema, credenciais nem o formato dos dados: o objeto
 * devolvido é exatamente o `MetaPortfolioScan` que os chamadores já usavam.
 */

import {
  SCAN_REUSE_TTL_MS,
  createGraphTelemetry,
  createSharedCache,
  type CacheSource,
} from "./graph-budget";
import type { MetaPortfolioScan } from "./provider.server";

const scanCache = createSharedCache<MetaPortfolioScan>(SCAN_REUSE_TTL_MS);

/** Chave estável e não reversível do token (nunca logamos o token). */
function tokenFingerprint(token: string): string {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(36)}:${token.length}`;
}

export type SharedScanResult = {
  scan: MetaPortfolioScan;
  /** `fresh` = varredura real; `cache`/`inflight` = zero requisições. */
  source: CacheSource;
};

/**
 * Executa (ou reutiliza) uma varredura de portfólio para este token.
 *
 * @param label Origem da chamada, apenas para o log de telemetria.
 */
export async function runSharedScan(
  userToken: string,
  opts?: { label?: string; deep?: boolean; force?: boolean },
): Promise<SharedScanResult> {
  const key = `${tokenFingerprint(userToken)}:${opts?.deep === false ? "shallow" : "deep"}`;
  if (opts?.force) scanCache.invalidate(key);

  const { value, source } = await scanCache.run(key, async () => {
    const { MetaProvider } = await import("./provider.server");
    const telemetry = createGraphTelemetry(opts?.label ?? "Meta discovery");
    try {
      const scan = await new MetaProvider().scanPortfolio(userToken, {
        deep: opts?.deep,
        telemetry,
      });
      console.log(telemetry.logLine(scan.telemetry ?? undefined));
      return scan;
    } catch (err) {
      console.log(telemetry.logLine(telemetry.finish("error")));
      throw err;
    }
  });

  if (source !== "fresh") {
    console.log(
      `${opts?.label ?? "Meta discovery"}: requests=0 cache=${source} pages=${value.pages.length}`,
    );
  }
  return { scan: value, source };
}

/** Invalida o reuso após ações que mudam a autorização (revogação, reauth). */
export function invalidateSharedScans(): void {
  scanCache.clear();
}
