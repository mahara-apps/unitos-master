# Casa 8: pauta que falhou no lote 2 + chaves de IA que somem

Tudo abaixo foi confirmado lendo o banco da Casa 8 (somente leitura) e o código.

## 1. Pauta mensal — o que aconteceu

| Hora (Brasília) | Geração | Resultado | Pauta salva |
| --- | --- | --- | --- |
| 18:34–18:35 | 37adafb2 | Falhou no "lote 2 de 5" | nenhuma |
| 18:57–18:58 | 06a40cb8 | Sucesso | "Marketing gera leads, clínica não transforma em faturamento" — 24 peças, rascunho |
| 18:58–18:59 | 3ac5a4e7 | Sucesso | "Conectando Leads ao Lucro…" — 13 peças, rascunho |

Por isso aparecem erro e sucesso juntos: são tentativas diferentes. A pauta de 62 peças não foi salva; as duas de sucesso são menores e estão em rascunho (vale o time ver se são duplicadas).

Causa exata da falha: o lote 1 deu certo. No lote 2 o Groq devolveu a 13ª ideia sem dia, hora e justificativa de publicação. O Groq confere o formato antes de entregar e, faltando campo, **recusa a resposta inteira**. O Unitos tratou isso como "pedido inválido" e parou tudo, sem tentar recuperar. A divisão em lotes funcionou; o problema não foi tamanho.

A Importação de Briefing já recupera a resposta que o provedor recusou. Isso nunca foi ligado à Pauta.

**Correção:**
1. Se um lote for recusado por formato, aproveitar a resposta que veio junto do erro, deixando dia/hora/justificativa ausentes como "sem sugestão" (o sistema já aceita esses campos vazios). Ideia sem título ou formato é descartada, e o complemento que já existe repõe a vaga.
2. Se não houver nada a aproveitar, repetir só aquele lote uma vez. Se falhar de novo, parar com mensagem em português, em vez de `ai_invalid_request`.

## 2. Chaves de IA que "somem" — o que o banco mostra

- Hoje a Casa 8 tem **só a chave do Groq** guardada. Não existe chave salva de OpenAI, Anthropic nem Gemini.
- **Anthropic — linha do tempo comprovada:**
  - 25/09 a 06/10: a verificação automática diária (00:20) testou a chave todos os dias, sem erro.
  - 07/10, 00:20: a verificação falhou com a mensagem da própria Anthropic: "Your credit balance is too low" (sem crédito na conta da API).
  - 07/10, 16:33: última tentativa de uso. A Anthropic recusou e o Groq assumiu como reserva, no mesmo segundo.
  - 08/10, 00:20: a verificação já não encontrou chave da Anthropic. **A chave foi apagada entre 07/10 16:33 e 08/10 00:20.**
- **Foi o sistema?** Não há sinal disso. A verificação automática e a falta de crédito só marcam a chave como inválida; nenhuma das duas apaga a chave. No código, o único caminho que apaga é o botão de lixeira em Conexões, usado por uma pessoa logada.
- **Foi um usuário?** É o único caminho que existe, mas não dá para dizer quem. A exclusão não grava autor, e nessa janela não houve nenhum outro registro de atividade nem de login. Foi no mesmo dia em que a falta de crédito apareceu, o que combina com alguém ter removido a chave sem crédito, mas isso não está registrado.
- **Gemini:** a verificação diária nunca testou uma chave do Gemini desde 25/09, então nenhuma ficou salva até a meia-noite seguinte. Se alguém cadastrou, ela saiu no mesmo dia, e também não ficou registro.
- **Não existe nenhum registro de quem apagou nem quando.** O sistema só apaga uma chave pelo botão da lixeira em Conexões, e esse botão não grava histórico. Por isso não dá para provar a causa das exclusões passadas, e eu não vou supor uma.

Encontrei também uma falha real no código que faz uma conexão sumir **do painel**:
- Salvar, testar ou remover uma chave, e também a verificação automática diária (00:20 em Brasília), leem a lista inteira de provedores, mexem em um e regravam a lista toda.
- Se duas dessas ações acontecem quase juntas, a segunda regrava a lista antiga e apaga do painel o provedor que acabou de ser salvo.
- Isso explica o painel mostrar "Não conectado", mas não explica a chave apagada no banco. As duas coisas precisam ser corrigidas e registradas.

**Correção:**
1. **Histórico de chaves** (novo, como você pediu): toda entrada, troca e remoção de chave de IA é registrada automaticamente pelo próprio banco, com data/hora, quem fez, provedor, ação (cadastrou / trocou / removeu), os últimos 4 caracteres e a origem (tela de Conexões, verificação automática, atualização do sistema ou outra). Funciona mesmo se a chave for apagada por um caminho que não é a tela. A chave real nunca é gravada.
2. Mudanças no painel de conexões (marcado como conectado, verificado ou removido) também entram nesse histórico, para mostrar quando o painel e a chave guardada ficam diferentes.
3. Ver o histórico: nova aba "Chaves de IA" em Configurações > Auditoria, só para Owner, Admin e Super Admin.
4. Fim da regravação da lista inteira: cada ação altera só o provedor dela, então uma não apaga a outra.
5. Remover chave passa a pedir confirmação ("Remover a chave do Gemini? A IA deixa de usar este provedor.").

## O que não muda

Telas de pauta, aprovação, provedores escolhidos, fallback, limites financeiros e permissões. As chaves que existem hoje continuam como estão. Depois de publicar, a Casa 8 precisa cadastrar de novo as chaves de Gemini/Anthropic; a partir daí, qualquer saída fica registrada.

## Observação (fora desta correção)

As gerações das 18:58 e 18:59 só passaram depois de esperar o limite do Groq de 8.000 tokens por minuto (cada lote usa cerca de 7.000). Com só o Groq conectado, uma pauta de 62 peças vai bater nesse limite a cada lote e ficar lenta. Isso se resolve cadastrando um provedor principal.

## Detalhes técnicos

- Pauta: em `src/lib/monthly-plan-generate.server.ts`, no `catch` de cada lote, usar `salvageStructuredOutput` (`src/lib/ai-output-salvage.ts`) com um normalizador que transforma os 3 campos de agenda ausentes em `null` e filtra itens sem `topic_title`/`content_format` válidos. Sem salvage: 1 nova tentativa e depois `invalid_output` com mensagem pt-BR. Registrar `salvaged: true` em `activity_events`.
- Migration aditiva: tabela `ai_credential_audit` (brand_id, provider, op, masked_last4, actor_id, source, connected_before/after, created_at) com RLS de leitura via `workspaceAdminActions`/Owner/Admin/Super Admin, sem INSERT para clientes; revogar privilégios perigosos de `anon`. Trigger `AFTER INSERT/UPDATE/DELETE` em `brand_api_credentials` e trigger em `brand_connections` comparando `providers` antigo × novo por provedor. `source` lido de `current_setting('app.credential_source', true)`, com padrão `unknown`.
- RPCs atômicas `set_provider_connection(brand, provider, jsonb)` / `remove_provider_connection(brand, provider)` usando `jsonb_set` / `providers - provider` em um único UPDATE; `connections.functions.ts` (save/test/remove) e `markProviderVerification` em `ai-model-health.server.ts` passam a usá-las via `callRpc`.
- UI: aba de leitura em Auditoria e confirmação no botão de remover em `connections.tsx`.
- Testes: lote recusado com `failed_generation` sem os 3 campos é aceito com nulos; sem conteúdo faz 1 nova tentativa e depois falha; total = cota. Salvar e verificar em paralelo preserva os dois provedores; o trigger grava insert/update/delete com os últimos 4 caracteres e nunca o texto da chave.
- MASTER-first: delta, `delta_version.txt` + `MASTER_RELEASE_VERSION` 1.4.75, `verify-installation.sql` cobrindo a tabela/triggers novos, `bun run master:check`. `roadmap.md` atualizado com as duas tarefas. Sem publicar nem atualizar a Casa 8 sem autorização.
