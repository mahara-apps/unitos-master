/**
 * Vigia de chamadas de texto a provedores DIRETOS (OpenAI/Anthropic/Gemini/Groq).
 *
 * Um provedor que aceita a conexão e nunca responde não gera erro: o processo
 * fica parado até ser encerrado pela plataforma e a reserva nunca é acionada.
 * Este vigia transforma silêncio em falha classificável ("timeout" →
 * provider_unavailable), que entra no retry/fallback já existente.
 */

/** Espera máxima até o provedor começar a responder. */
export const FIRST_RESPONSE_TIMEOUT_MS = 45_000;
/** Espera máxima sem nenhum pedaço novo no meio de uma resposta em stream. */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

export class ProviderTimeoutError extends Error {
  readonly waitedMs: number;
  readonly phase: "first_response" | "stream_idle";
  constructor(provider: string, phase: "first_response" | "stream_idle", waitedMs: number) {
    super(
      `ai_provider_timeout: ${provider} não respondeu a tempo ` +
        `(${phase === "first_response" ? "sem início de resposta" : "resposta parada"} por ${Math.round(waitedMs / 1000)}s) — timeout`,
    );
    this.name = "ProviderTimeoutError";
    this.waitedMs = waitedMs;
    this.phase = phase;
  }
}

export function isProviderTimeoutError(err: unknown): err is ProviderTimeoutError {
  return err instanceof ProviderTimeoutError ||
    (err instanceof Error && err.message.startsWith("ai_provider_timeout:"));
}

/** Junta o signal de quem chamou com o do vigia. */
export function linkAbort(parent: AbortSignal | undefined, child: AbortController) {
  if (!parent) return () => {};
  if (parent.aborted) { child.abort(parent.reason); return () => {}; }
  const on = () => child.abort(parent.reason);
  parent.addEventListener("abort", on, { once: true });
  return () => parent.removeEventListener("abort", on);
}

/**
 * Executa `run(signal)` exigindo que ele resolva em até `ms`. Ao estourar,
 * aborta a requisição (para não seguir gastando) e rejeita com ProviderTimeoutError.
 */
export async function withFirstResponseDeadline<T>(
  provider: string,
  parent: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
  ms = FIRST_RESPONSE_TIMEOUT_MS,
): Promise<{ value: T; controller: AbortController; unlink: () => void }> {
  const controller = new AbortController();
  const unlink = linkAbort(parent, controller);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new ProviderTimeoutError(provider, "first_response", ms);
      controller.abort(e);
      reject(e);
    }, ms);
  });
  try {
    const value = await Promise.race([run(controller.signal), deadline]);
    return { value, controller, unlink };
  } catch (err) {
    unlink();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lê o PRIMEIRO pedaço útil do stream dentro do prazo (para que um stream
 * aberto e mudo ainda possa cair na reserva) e devolve um stream equivalente
 * com vigia de inatividade entre pedaços.
 */
export async function guardStream<T>(
  provider: string,
  source: ReadableStream<T>,
  controller: AbortController,
  opts: { firstMs?: number; idleMs?: number; onDone?: () => void } = {},
): Promise<ReadableStream<T>> {
  const firstMs = opts.firstMs ?? FIRST_RESPONSE_TIMEOUT_MS;
  const idleMs = opts.idleMs ?? STREAM_IDLE_TIMEOUT_MS;
  const reader = source.getReader();
  const readWithin = async (ms: number, phase: "first_response" | "stream_idle") => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const e = new ProviderTimeoutError(provider, phase, ms);
            // Rejeita ANTES de cancelar: o cancel resolve a leitura pendente
            // como "fim" e venceria a corrida, mascarando o timeout.
            reject(e);
            controller.abort(e);
            reader.cancel(e).catch(() => {});
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const buffered: T[] = [];
  // Metadados (stream-start/response-metadata) não provam que o modelo está
  // gerando: espera o primeiro pedaço de conteúdo, de erro ou o fim.
  for (;;) {
    const r = await readWithin(firstMs, "first_response");
    if (r.done) { opts.onDone?.(); return new ReadableStream<T>({ start(c) { buffered.forEach((x) => c.enqueue(x)); c.close(); } }); }
    buffered.push(r.value);
    const type = (r.value as { type?: string } | null)?.type;
    if (type !== "stream-start" && type !== "response-metadata") break;
  }
  return new ReadableStream<T>({
    start(c) { buffered.forEach((x) => c.enqueue(x)); },
    async pull(c) {
      try {
        const r = await readWithin(idleMs, "stream_idle");
        if (r.done) { opts.onDone?.(); c.close(); return; }
        c.enqueue(r.value);
      } catch (err) {
        opts.onDone?.();
        // Erro como parte do stream: o medidor registra a falha com causa.
        c.enqueue({ type: "error", error: err } as unknown as T);
        c.close();
      }
    },
    cancel(reason) { opts.onDone?.(); return reader.cancel(reason); },
  });
}
