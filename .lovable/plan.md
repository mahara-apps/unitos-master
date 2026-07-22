## Diagnóstico (confirmado por logs)

Rodei query em `ai_jobs` e em `ai_gateway_logs`. Padrão é inequívoco:

- Últimos 8 jobs `customer_strategy` → todos travaram em `progress=20` ou `55` ("Modelando voz e personas" / "Construindo cohorts") e foram mortos pelo reaper (`reap_stuck_ai_jobs`, migration `20260714211842`) após 5min sem `updated_at`.
- Logs do gateway para `google/gemini-2.5-pro`: 9 chamadas, duração média **26–33s**. Metade retorna 200, **metade é cancelada com HTTP 499 (~30–33s)** — bate exatamente no teto de subrequisição do Cloudflare Worker.
- Job atual (`e5289bb3…`, iniciado 01:47) está travado no passo Voice+Personas em `Promise.all`. A chamada de `personas` (strategic → gemini-2.5-pro) foi cancelada às 01:48 (HTTP 499, 33.3s). O handler engole a exceção via `Promise.all` sem `catch` → o job fica pendurado até o reaper matar.

Causa raiz: `runPhase1` em `src/routes/api/jobs/customer-pipeline.ts` usa modelo de geração anterior (`gemini-2.5-pro`) que, com structured output do AI SDK, encosta no limite de subrequest do Worker. Quando cancela, não há retry, telemetria de erro nem `patch({ status: 'failed' })` — o reaper mata em silêncio.

## Correções

### 1. Trocar modelos para geração atual (arquivo: `src/routes/api/jobs/customer-pipeline.ts`)

- `STRATEGIC_MODEL`: `google/gemini-2.5-pro` → `google/gemini-3.1-pro-preview` (Pro atual, mais rápido).
- `OPERATIONAL_MODEL`: `google/gemini-2.5-flash` → `google/gemini-3.6-flash` (Flash atual, muito mais rápido).
- Manter os `modelOverride: OPERATIONAL_MODEL` já usados em `voice` e `cohorts`.
- Para `swot` (a chamada strategic mais longa) usar override para `gemini-3.6-flash` também — o schema é pequeno e volume alto.

### 2. Falhar rápido em vez de esperar o reaper

Envolver cada `runStructured` em um `Promise.race` com timeout de 60s. Se estourar, lançar erro claro → o `catch` externo já grava `status='failed'` com mensagem legível, em vez de "timeout: worker interrompido".

### 3. Isolar falha do `Promise.all` Voice+Personas

Trocar `Promise.all` por `Promise.allSettled` e, se qualquer um falhar, retornar erro específico ("Falha ao gerar voz" / "Falha ao gerar personas") antes de prosseguir. Hoje uma rejeição derruba os dois em silêncio.

### 4. Heartbeat entre chamadas longas

Chamar `patch({ progress: <mesmo valor> })` no início de cada `runStructured` para renovar `updated_at`, garantindo que o reaper de 5min não mate jobs que ainda estão de fato executando.

### 5. Marcar o job travado atual como falho

Após deploy, rodar `SELECT public.reap_stuck_ai_jobs();` uma vez para limpar o job `e5289bb3-d0b7-4341-8d94-43db344e7ef1` que já está em execução.

## Fora de escopo

- Não mexer no reaper SQL nem no intervalo de 5min.
- Não mudar prompts nem schemas.
- Não tocar em `generate-ideas` / Fase 2 (nenhum sinal de falha).

## Como validar

1. Abrir `/customers/<id>` e rodar "Gerar estratégia" com briefing curto.
2. Acompanhar `ai_jobs` — deve avançar 5 → 20 → 55 → 70 → 100 em < 2min.
3. Verificar no gateway que todas as chamadas ficam < 20s e retornam 200.
4. Confirmar `brand_briefings`, `brand_voice_cards`, `brand_personas`, `brand_cohorts`, `brand_swot` populados para o cliente.
