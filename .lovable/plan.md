# Pauta mensal em lotes: evitar estouro de tamanho da resposta da IA

## Resposta direta

Sim, evita esse erro. A falha da Casa 8 (62 peças, Groq `gpt-oss-20b`) aconteceu porque a IA precisou escrever tudo de uma vez e bateu no teto de 8.192 tokens antes de fechar a resposta. Com lotes de até 15 peças, cada resposta fica bem abaixo desse teto. O fluxo atual (tela, aprovação, peças, Kanban, legendas) não muda: só muda **como** a IA é chamada por dentro.

## Como fica para o usuário

- Mesma tela e mesmo botão "Gerar pauta".
- O aviso de progresso passa a mostrar "Gerando ideias — lote 2 de 5".
- A pauta só aparece quando **todas** as peças contratadas estiverem prontas (nada parcial é salvo, como hoje).
- Se um lote falhar, a tentativa seguinte retoma do lote que faltou, sem refazer os prontos.

## O que será feito

1. **Dividir as vagas em lotes**: as vagas contratadas (canal + formato) são repartidas em blocos de no máximo 15, mantendo a proporção de cada canal/formato em cada lote. A soma dos lotes é sempre igual ao contratado.
2. **Primeiro lote define o "cabeçalho" da pauta** (título, descrição, objetivos). Os lotes seguintes pedem só as ideias, recebendo o tema e os títulos já gerados para não repetir ideias.
3. **Juntar antes de salvar**: as ideias de todos os lotes passam pela mesma distribuição determinística por vaga que existe hoje e são gravadas juntas no final.
4. **Retomada por lote**: o checkpoint do job guarda quais lotes já terminaram. Uma nova tentativa reaproveita esses lotes.
5. **Complemento continua igual**: se um lote vier com menos ideias, a rodada única de complemento atual cobre só as vagas daquele lote.
6. **Falha por resposta cortada vira mensagem clara**: se mesmo assim um lote for cortado, o usuário vê "A resposta da IA foi interrompida por tamanho" em vez de erro genérico.
7. **Pautas pequenas (até 15 peças)** seguem em uma chamada só, exatamente como hoje.

## O que NÃO muda

- Escolha de provedor/modelo, fallback Groq, bloqueio financeiro e orçamento.
- Prompt de conteúdo (regras, pt-BR, estratégia, briefing, métricas).
- Tabelas, permissões, RLS, aprovação, criação de peças e legendas.
- Nenhuma migration nova prevista.

## Custo e tempo

Mais chamadas menores em sequência (62 peças = 5 lotes). O total de texto gerado é praticamente o mesmo; o contexto da marca é reenviado a cada lote, então o consumo sobe um pouco. A geração continua em segundo plano. Lotes rodam em sequência (não em paralelo) para não estourar limite de uso do provedor.

## Detalhes técnicos

- `src/lib/monthly-plan-distribution.ts`: nova função pura `splitQuotaIntoBatches(quota, maxPerBatch=15)` → lista de `ChannelFormatQuota` cuja soma é igual à cota original.
- `src/lib/monthly-plan-generate.server.ts`: substituir a chamada única por laço sobre os lotes; `buildPrompt` recebe flag `includeHeader` (só no lote 1) e `avoid` acumulado; schema de wire dos lotes seguintes sem `title/description/objectives` obrigatórios (schema portátil, sem bounds). Alocador global único continua garantindo a vaga contratada.
- `src/lib/monthly-plan-observability.server.ts`: `setPlanJobStep(..., "ia", "lote N de M")` e `setPlanJobCheckpoint` com `batches_done` + ideias pendentes; `monthly-plan-resume.server.ts` lê esse checkpoint.
- `src/lib/monthly-plan-ai-options.ts`: constante `PLAN_BATCH_SIZE = 15`; `PLAN_MAX_OUTPUT_TOKENS` mantido.
- `src/lib/monthly-plan-agent.server.ts`: classificar `finish_reason: length` como falha própria (`output_truncated`) com mensagem pt-BR.
- Testes: soma dos lotes = cota contratada (62 → 15/15/15/15/2 distribuídos por canal/formato); pauta ≤15 = 1 lote; retomada pula lotes concluídos; nada salvo se um lote falhar; truncamento gera a mensagem nova.
- MASTER-first: delta regenerado, `delta_version.txt` + `MASTER_RELEASE_VERSION` 1.4.74, `bun run master:check`, build. Sem publicar nem atualizar instalações sem autorização.
