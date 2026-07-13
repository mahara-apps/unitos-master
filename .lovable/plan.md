
## Diagnóstico

Auditei os quatro orquestradores (`monthly-plan`, `customer-pipeline`, `post-phase2`, `copilot`) e a tabela `ai_jobs`. Existem **dois defeitos estruturais** que explicam por que a geração "roda" por horas e nunca conclui — na prática ela nem chega a começar de verdade.

### 1. IDs de modelo inválidos (falha imediata na chamada ao Gateway)
Os jobs usam:
- `google/gemini-3.1-pro-preview` — não existe no catálogo do Lovable AI Gateway
- `openai/gpt-5.4-mini` — não existe no catálogo

Toda chamada `generateText(...)` devolve **400 do Gateway** ("unknown model"). O `runStructured` propaga o erro, o `catch` marca o job como `failed` — mas como o Worker já foi encerrado (ver defeito 2), o UPDATE nunca chega ao banco e o job fica preso em `queued` / `running` para sempre.

### 2. Execução background sem `waitUntil` (Cloudflare Worker morre após o 202)
Todos os handlers fazem:
```ts
void runOrchestrator({ ... });
return new Response(..., { status: 202 });
```
No runtime Cloudflare Workers (workerd), assim que o handler retorna a resposta, o **isolate é terminado**. Qualquer Promise pendente é abortada silenciosamente. Não há Node.js "event loop" que continue rodando em segundo plano. Resultado: o `ai_jobs` fica com `status='queued'` ou `progress=5` indefinidamente.

O caminho correto no Workers é `ctx.waitUntil(promise)` para estender a vida do isolate, **ou** um worker de fila (pg_cron + endpoint `/api/public/jobs/tick`) que polla `ai_jobs` e processa rows pendentes — que também é o padrão recomendado no knowledge de "long-running AI".

### 3. Efeitos colaterais confirmados
- `SELECT * FROM ai_jobs` está vazia agora, mas o orb da UI ainda mostra o job da sessão anterior via realtime/cache local — daí a sensação de "gerando há 2 horas".
- O `copilot.ts` já usa `google/gemini-2.5-flash` (modelo válido) — por isso o copiloto às vezes funciona, enquanto o Plano do Mês nunca.

---

## Plano de correção

### Passo 1 — Trocar todos os IDs de modelo para catalog-válidos
Em `src/routes/api/jobs/monthly-plan.ts`, `customer-pipeline.ts`, `post-phase2.ts` e `src/lib/ai-agents.functions.ts`:
- `STRATEGIC_MODEL = "google/gemini-2.5-pro"`
- `OPERATIONAL_MODEL = "google/gemini-2.5-flash"` (mais barato e rápido que gpt-5-mini para copy/brief)

> Se preferir OpenAI no operacional, uso `openai/gpt-5-mini` (esse existe). Me confirme.

### Passo 2 — Executar em background de verdade (`waitUntil`)
Refatorar cada handler para obter o `executionCtx` do Cloudflare via helper do TanStack Start (`getEvent()` → `context.cloudflare.ctx.waitUntil(...)`) e envolver o `runOrchestrator/runPhase1/runPhase2/runCopilotJob` com:
```ts
ctx.waitUntil(runOrchestrator({...}))
```
Fallback quando `ctx` não existir (dev local): manter `void` para não quebrar o preview.

### Passo 3 — Watchdog / retomada
Adicionar um endpoint público `/api/public/jobs/reap` que:
- marca como `failed` qualquer `ai_jobs` com `status IN ('queued','running')` e `updated_at < now() - interval '5 min'`
- registra `error: 'timeout ou worker interrompido'`

Isso destrava a UI instantaneamente e serve de rede de segurança. Recomendo agendar via pg_cron a cada 2 min (posso subir a migration).

### Passo 4 — Vault de agentes (`agent_prompts`)
Estou aguardando o **MD com os agentes** que você mencionou. Quando enviar, faço a migration para popular `agent_prompts` (upsert por `agent_id`) com os system prompts finais e ajusto os `agent_id` esperados pelo orquestrador (`planner_strategic`, `copywriter_senior`, `art_director_social`, e os que vierem novos no MD).

### Passo 5 — Validação
- Limpar jobs zumbis: `UPDATE ai_jobs SET status='failed', error='reset manual' WHERE status IN ('queued','running')`.
- Disparar "✨ Gerar Plano do Mês" em um cliente com briefing preenchido e observar `ai_jobs` progredir de `queued → running → succeeded` em ~10-30s.
- Conferir logs do server function (`server-function-logs`) para garantir zero 400 do Gateway.

---

## Perguntas antes de eu implementar

1. Pode **colar o MD dos agentes** agora? Sem ele o Passo 4 fica pendente (o resto eu já implemento).
2. Modelo operacional preferido: `google/gemini-2.5-flash` (default) ou `openai/gpt-5-mini`?
3. Autorizo criar o cron de reaper (Passo 3) via `pg_cron`?
