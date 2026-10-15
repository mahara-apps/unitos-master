# Pauta mensal: recuperar lote recusado pelo Groq por campo de agenda faltando

## O que aconteceu (confirmado no banco da Casa 8, somente leitura)

Foram 3 gerações, em sequência, no mesmo cliente:

| Hora (Brasília) | Job | Resultado | Pauta salva |
| --- | --- | --- | --- |
| 18:34–18:35 | 37adafb2 | Falhou no "lote 2 de 5" (`ai_invalid_request`) | nenhuma |
| 18:57–18:58 | 06a40cb8 | Sucesso | "Marketing gera leads, clínica não transforma em faturamento" — 24 peças, rascunho |
| 18:58–18:59 | 3ac5a4e7 | Sucesso | "Conectando Leads ao Lucro…" — 13 peças, rascunho |

Por isso o painel mostra erro e sucesso: são tentativas diferentes. A pauta de 62 peças **não** foi salva; as de sucesso são menores (24 e 13). Existem hoje duas pautas em rascunho que podem ser duplicadas entre si — vale o time conferir qual manter.

Causa exata da falha (evento `plan_step_failed` de 21:35:52 UTC):
- Lote 1 funcionou. No lote 2, o Groq (`openai/gpt-oss-20b`) devolveu a 13ª ideia sem os campos `suggested_weekday`, `suggested_time` e `slot_rationale` (dia, hora e justificativa de publicação).
- O Groq confere a resposta contra o formato antes de entregá-la e, ao achar campo faltando, **recusa a resposta inteira** com "Generated JSON does not match the expected schema".
- O Unitos classificou isso como "pedido inválido" e encerrou a pauta toda, sem tentar recuperar. A divisão em lotes funcionou; o tamanho não foi o problema desta vez.

Esse mesmo caso já é tratado na Importação de Briefing (recupera a resposta descartada pelo provedor), mas esse tratamento nunca foi ligado à Pauta.

## O que será feito

1. Quando o provedor recusar um lote por formato, aproveitar a resposta que ele descartou (vem junto do erro), preenchendo dia/hora/justificativa ausentes como "sem sugestão" — exatamente como o sistema já faz hoje quando esses campos vêm vazios. Os demais campos continuam obrigatórios; uma ideia sem título/formato é descartada e o complemento já existente repõe a vaga.
2. Se não houver nada aproveitável, repetir aquele lote uma única vez; se falhar de novo, encerrar com mensagem em português ("A IA devolveu ideias incompletas…") em vez de `ai_invalid_request`.
3. Nada muda em telas, aprovação, provedores, fallback, limites financeiros ou permissões. Sem migration.

## Observação registrada (não faz parte desta correção)

Os sucessos das 18:58 e 18:59 só passaram após esperar o limite do Groq de 8.000 tokens por minuto (cada lote usa ~7.000). Uma pauta de 62 peças (5 lotes) vai encostar nesse limite a cada lote, ficando lenta. Também apareceu o Groq como primeira tentativa nessas gerações, o que contraria a regra "Groq só como reserva"; isso precisa ser verificado na configuração de conexões da Casa 8 antes de qualquer mudança.

## Detalhes técnicos

- `src/lib/monthly-plan-generate.server.ts`: no `catch` da chamada por lote, usar `salvageStructuredOutput(error, PlanSchema, normalizePlanBatch)` de `src/lib/ai-output-salvage.ts`; `normalizePlanBatch` aceita `topics[]` com `suggested_weekday/suggested_time/slot_rationale` ausentes → `null` e filtra itens sem `topic_title`/`content_format` válido.
- Sem salvage: 1 nova tentativa do lote; persistindo, falha `invalid_output` (não `invalid_request`, não aciona fallback de cota) com mensagem pt-BR em `ai-failures.server.ts`/`describeError`.
- Registrar em `activity_events` quando houver recuperação (`salvaged: true`, nº de ideias recuperadas).
- Testes em `tests/monthly-plan-batches.unit.test.ts`: erro com `failed_generation` sem os 3 campos → lote aceito com nulos; erro sem conteúdo → 1 retry e depois `invalid_output`; total final = cota contratada.
- MASTER-first: delta, `delta_version.txt` + `MASTER_RELEASE_VERSION` 1.4.75, `bun run master:check`. Sem publicar nem atualizar a Casa 8 sem autorização.
