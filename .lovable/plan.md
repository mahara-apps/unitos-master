# Pauta mensal da Casa 8 parada em 60% com o Gemini

## O que aconteceu (leitura no banco da Casa 8, sem alterar nada)

- Geração `55592d7b`: 8 peças, tema "Receitas para a ceia de natal que usem leite", com o Gemini (`gemini-flash-latest`) escolhido.
- Começou às 12:18:22. Às 12:18:24 a busca na base de conhecimento respondeu normalmente.
- Depois disso ficou na etapa "Gerando ideias com a IA" (60%). **Não há nenhum registro da chamada ao Gemini: nem sucesso, nem erro.** A chamada foi feita e nunca voltou.
- O último sinal de vida do processo foi às 12:22:52. O processo foi encerrado pela plataforma por tempo. Às 12:26:00 a rotina de limpeza marcou a geração como "timeout: worker interrompido antes da conclusão".
- Como não houve erro, a reserva (Groq) **nunca foi acionada**: o sistema só troca de provedor quando o principal responde com erro, não quando ele fica em silêncio.

## Não é caso isolado

- As três últimas gerações com o Gemini (29/10, 06/11 e hoje) falharam do mesmo jeito: 60%, timeout, sem registro da chamada.
- As gerações com o Groq (15/10 e 26/10) concluíram em menos de 1 minuto.
- Ontem (10/11) o Gemini recusou 27 chamadas na Casa 8 com "modelo com alta demanda, tente mais tarde". O Gemini só concluiu 2 respostas de texto na Casa 8 até hoje (a última em 30/10).
- Não tem relação com a versão 1.4.87 (troca de modelos), que ainda não foi publicada. O modelo usado na Casa 8 já é o atual do Google.

## Correção proposta

1. **Limite de espera por chamada de texto**: se o provedor não começar a responder em até 45 s, ou ficar 60 s sem mandar nada no meio da resposta, a chamada é cancelada e tratada como "provedor indisponível".
2. **Reserva automática**: esse caso passa a acionar a mesma troca que já existe para erro de alta demanda: uma nova tentativa limitada e depois o Groq, dentro do tempo do processo.
3. **Registro da tentativa**: a chamada cancelada fica no histórico de consumo como falha "sem resposta do provedor", com o provedor e o modelo. Assim o próximo caso já aparece com a causa.
4. **Mensagem clara**: se até a reserva falhar, a geração termina com "O Gemini não respondeu a tempo e a reserva também falhou", e não com o timeout genérico.
5. **Aviso no painel de provedores**: o Gemini aparece como "instável" quando acumular chamadas sem resposta ou de alta demanda nas últimas horas (usa o aviso de saúde que já existe).

## Detalhes técnicos

- Onde: `withModelInstrumentation` em `src/lib/ai-provider.server.ts`. Envolver `doStream`/`doGenerate` com um AbortController de primeiro byte e de inatividade, combinado com o signal de quem chamou. Classificar como `provider_unavailable` (kind `provider_timeout`) para entrar no ramo de retry/fallback existente.
- O tempo total (45 s + retry + Groq) cabe dentro do lease do job. O heartbeat continua; a etapa "ia" ganha `step_label` com o provedor atual.
- `recordAiUsage` registra a tentativa abortada (`success=false`, `error_kind='provider_timeout'`). O check de orçamento não muda.
- `src/lib/ai-provider-health.ts`: novo sinal "instável" a partir de `brand_ai_usage` recente.
- Testes: provedor que nunca responde, que trava no meio, resposta lenta mas válida, e cascata para o Groq com registro.
- MASTER-first: delta, `delta_version.txt` = `MASTER_RELEASE_VERSION` (1.4.88), verify-installation se algo do banco mudar, `bun run master:check`. Publicação e atualização da Casa 8 só com autorização.

## Enquanto isso
Na Casa 8, gerar a pauta escolhendo outro modelo (ou deixando sem escolher) evita o travamento. O Groq está funcionando.
