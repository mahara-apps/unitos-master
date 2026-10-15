# Pauta mensal em lotes + proteção contra respostas cortadas em toda a IA

## Resposta direta

Sim, a divisão em lotes evita o erro da Casa 8 (62 peças, Groq `gpt-oss-20b`, resposta cortada em 8.192 tokens). E respondendo à sua pergunta: há outros pontos que podem sofrer o mesmo problema. Abaixo está o mapa, do mais arriscado ao menos arriscado, e o que fazer em cada um.

## Onde mais pode estourar (verificado no código)

| Etapa | Risco | Por quê |
| --- | --- | --- |
| 1. Pauta mensal (onde falhou) | Alto | Uma única resposta com todas as peças. |
| 2. Legendas das peças depois da aprovação | Médio | Cada peça é feita sozinha (bom), mas a chamada **não define limite de tamanho** e não detecta resposta cortada; uma legenda longa com carrossel pode ser cortada e virar "saída inválida". 62 peças de uma vez também disparam muitas chamadas seguidas (risco de limite de uso do provedor, não de tamanho). |
| 3. Estratégia IA do cliente (Voz, Personas, Cohorts, SWOT, matriz de concorrentes) | Médio | Respostas grandes com várias listas, **sem limite de tamanho definido** e sem detecção de corte. Depende do padrão de cada provedor (no Groq costuma ser baixo). |
| 4. Plano de mídia com IA | Baixo | Até 10 iniciativas; também sem limite definido. |
| 5. Agentes gerais (`pauta.suggest`, `content.generate` etc.) | Baixo/médio | Limite de 8.000 já definido, mas sem mensagem clara de corte. |
| 6. Importação de briefing | Baixo | Já tem limite e opções por provedor (padrão que deu certo). |
| 7. Copilot, Brain, resumo do painel | Baixo | Respostas curtas de texto livre. |

## O que será feito

### Parte 1 — Pauta mensal em lotes (resolve o erro atual)
1. As vagas contratadas (canal + formato) são divididas em lotes de no máximo 15, mantendo a soma exata do contratado.
2. O primeiro lote gera também título, descrição e objetivos; os seguintes geram só as ideias, recebendo os títulos já criados para não repetir.
3. Tudo é juntado e passa pela distribuição por vaga que já existe, e só então é salvo. Nada parcial é salvo.
4. Se um lote falhar, a nova tentativa retoma do lote que faltou.
5. O aviso mostra "Gerando ideias — lote 2 de 5". Pautas de até 15 peças seguem em uma chamada, como hoje.

### Parte 2 — Mesma regra nos outros pontos
1. **Regra única para todas as gerações de texto com resposta estruturada**: limite de tamanho explícito, opções corretas por provedor (as mesmas que já funcionam no briefing) e detecção de "resposta cortada por tamanho" com mensagem em português, em vez de "saída inválida".
2. **Legendas**: aplicar a regra acima por peça e manter a fila em ritmo controlado (a fila já existe); nenhuma mudança no fluxo de aprovação.
3. **Estratégia IA**: aplicar a regra; se uma etapa ainda for cortada, refazer **só aquela etapa** pedindo menos itens (ex.: personas em menor número), sem refazer as etapas prontas.
4. **Plano de mídia e agentes gerais**: aplicar a regra (limite + detecção de corte).
5. Uma resposta cortada nunca é salva pela metade e nunca dispara o fallback Groq sozinha (cortar não é falha temporária).

## O que NÃO muda

Telas, aprovação, Kanban, provedores escolhidos, fallback Groq em falhas temporárias, bloqueio financeiro, prompts de conteúdo, pt-BR, permissões e tabelas. Nenhuma migration prevista.

## Custo e tempo

A pauta passa a fazer algumas chamadas a mais (62 peças = 5 lotes), em sequência; o contexto da marca é reenviado em cada lote, então o consumo sobe um pouco. As demais partes não ficam mais caras.

## Ordem de execução

Parte 1 primeiro, com testes; depois Parte 2, um ponto por vez. Cada parte fecha com versão do MASTER e verificação.

## Detalhes técnicos

- Novo `src/lib/ai/output-budget.ts`: `TEXT_MAX_OUTPUT_TOKENS` por tipo de tarefa, `providerOutputOptions(provider)` (generaliza `planProviderOptions`/`briefingProviderOptions`; Groq `reasoningEffort: "low"`, nunca `"none"`) e `isTruncated(result)` (`finishReason === "length"`) → falha `output_truncated` em `ai-failures.server.ts` (não retentável no mesmo tamanho, não aciona fallback), mensagem pt-BR.
- Pauta: `splitQuotaIntoBatches(quota, 15)` em `src/lib/monthly-plan-distribution.ts`; laço de lotes em `monthly-plan-generate.server.ts` com `includeHeader` só no lote 1 e `avoid` acumulado; alocador global único; checkpoint `batches_done` em `monthly-plan-observability.server.ts` e leitura em `monthly-plan-resume.server.ts`.
- Aplicar o helper em `post-agents.server.ts` (legendas), `routes/api/jobs/customer-pipeline.ts` (estratégia; redução de itens só na etapa cortada), `media-plans-ai.functions.ts`, `ai-agents.functions.ts`, `dashboard.functions.ts`; `briefing-ai-executor.server.ts` passa a usar o helper sem mudar valores.
- Testes: soma dos lotes = cota (62 → 15/15/15/15/2); ≤15 = 1 lote; retomada pula lotes prontos; nada salvo se um lote falhar; `finishReason: "length"` gera `output_truncated` sem fallback em cada ponto coberto.
- MASTER-first: delta regenerado, `delta_version.txt` + `MASTER_RELEASE_VERSION` (1.4.74 e seguintes), `bun run master:check`, build. Sem publicar nem atualizar instalações sem autorização.
