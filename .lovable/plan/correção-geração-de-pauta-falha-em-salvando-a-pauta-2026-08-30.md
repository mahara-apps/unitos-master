# Correção: geração de pauta falha em "Salvando a pauta"

## O que os dados mostram

Verifiquei os jobs e a telemetria reais:

- As duas últimas tentativas (30/08 03:36 e 03:37) falharam com `status: failed`,
  `step_label: "Salvando a pauta"` e `error: "[object Object]"`.
- Na mesma janela, a telemetria registra `plan_step_ok` da etapa de IA
  (`gemini/gemini-flash-latest#1:success`). Ou seja: a IA já está funcionando —
  as correções de provider/quota/schema surtiram efeito.
- A falha agora é na **persistência**, e a mensagem real está perdida: o código
  faz `String(err)`, e erros do Supabase/PostgREST chegam como objeto simples
  (`{ message, code, details, hint }`), não como `Error`. Isso produz
  literalmente `[object Object]` no job, no toast e no modal.
- Conferi o schema: todas as colunas gravadas em `monthly_plans` e
  `monthly_plan_topics` existem. As policies de INSERT das duas tabelas exigem
  `can_access_client(...) AND is_agency_operator(auth.uid(), brand_id)`.

Diagnóstico da causa raiz da persistência: **ainda não confirmado** — a mensagem
foi destruída pela serialização. A hipótese mais provável é bloqueio de RLS
(`is_agency_operator`) ou violação de constraint em `monthly_plan_topics`. O
primeiro passo do plano é justamente expor a mensagem verdadeira e então corrigir
o que ela apontar.

## Correções

1. **Serialização honesta de erro (causa do `[object Object]`)**
   - Novo helper compartilhado que extrai mensagem de `Error`, string e objetos
     PostgREST (`message` + `code`/`details`/`hint`), com fallback para JSON curto.
   - Usar em `monthly-plans.functions.ts` (gravação de `ai_jobs.error`) e em
     `describeError` (`src/lib/errors.ts`), para que toast, modal e histórico
     mostrem texto legível em pt-BR — nunca `[object Object]`.

2. **Log estruturado da etapa de persistência**
   - Em `monthly-plan-generate.server.ts`, registrar `logPlanEvent` com
     `step: "conclusao"`, `ok: false` e a mensagem real quando o insert/update de
     `monthly_plans` ou `monthly_plan_topics` falhar, antes de propagar o erro.

3. **Reprodução e correção da falha real**
   - Rodar a geração autenticada de novo, ler a mensagem agora legível em
     `ai_jobs.error`/`activity_events`, e corrigir exatamente o que ela indicar:
     - se for RLS/permissão: ajustar o caminho de escrita respeitando a matriz de
       papéis vigente (sem afrouxar policy nem trocar para service role em
       leitura/escrita comum);
     - se for constraint/valor: normalizar o valor gravado (canal/formato/status)
       antes do insert.
   - Nada de mascarar com try/catch silencioso: pauta incompleta continua não
     sendo salva e o usuário recebe mensagem acionável.

4. **Mensagens acionáveis já existentes**
   - Manter `ai_output_truncated` / `ai_invalid_request` e a preservação de
     quota/rate-limit do provedor primário como causa reportada.

## Pendências desta rodada anterior (fechar junto)

- Ligar `assertPtBrPayload` (de `src/lib/ai-language.ts`) à validação de
  `runJson` no pipeline `customer-pipeline.ts`, com uma retentativa quando a
  saída vier predominantemente em inglês (foco em `cohorts`).
- Em `strategy-panel.tsx`, usar `objecoes_comuns[0]` / `dores[0]` como fallback
  de `objecao_dominante` / `dor_principal`, para "Barreira principal" deixar de
  aparecer como "—".

## Fuso horário oficial: Brasília (America/Sao_Paulo, GMT-3)

O que verifiquei hoje:

- Não existe uma fonte única de fuso. `src/lib/date-range.ts` usa a hora **local
  do host** (`setHours`, `getFullYear`) — no servidor isso é UTC, então "hoje"
  vira o dia seguinte a partir das 21:00 de Brasília.
- `currentPeriodMonth` (`src/lib/plan-overage.server.ts`) calcula o mês em UTC,
  o que joga a virada de mês 3h antes.
- `America/Sao_Paulo` aparece hardcoded em pontos isolados (perfil, templates de
  mensagem), sem um constante compartilhada.

Correções:

1. Novo `src/lib/timezone.ts`: `APP_TIMEZONE = "America/Sao_Paulo"` como fuso
   oficial do sistema, com helpers puros — `nowInAppTz()`, `startOfDayAppTz()`,
   `endOfDayAppTz()`, `appTzDateKey()` (YYYY-MM-DD), `formatAppTz()` — usando
   `Intl.DateTimeFormat` (respeita GMT-3 e qualquer regra futura sem hardcode de
   offset).
2. `date-range.ts` passa a derivar dia/mês pelo fuso oficial, mantendo a regra
   atual de intervalo fechado/inclusivo e a contagem de dias.
3. `currentPeriodMonth` e demais chaves de período/mês passam a usar o fuso
   oficial (a pauta do mês vira à meia-noite de Brasília, não às 21:00).
4. Agendamento e cron: publicação agendada, timers, due dates e jobs
   `/api/public/cron/*` comparam instantes em UTC (correto) mas exibem e
   agrupam por dia usando o fuso oficial; entradas de data/hora vindas da UI são
   interpretadas como Brasília antes de virar instante UTC.
5. Formatação e exports (CSV, e-mails, notificações, KPIs, histórico) usam
   `formatAppTz`, substituindo os `America/Sao_Paulo` hardcoded pela constante.
6. Persistência continua em `timestamptz`/UTC — o fuso é regra de apresentação e
   de fronteira de dia, nunca de armazenamento.
7. Testes: fronteiras 23:00/00:30 de Brasília, virada de mês, contagem de "30
   dias" e chave de dia, com o `TZ` do processo forçado para UTC para provar que
   o resultado não depende do host.

## Fora de escopo

RBAC, RLS, autenticação, tenants/workspaces, Instalação × Workspace, migrations
históricas, banco e arquitetura. Nenhum uso de Cloud AI / Lovable Gateway — o
projeto segue BYOK.

## Validação

Reprodução real da geração de pauta (falha legível e depois sucesso), testes de
pauta e de idioma, `tsgo` e build.
