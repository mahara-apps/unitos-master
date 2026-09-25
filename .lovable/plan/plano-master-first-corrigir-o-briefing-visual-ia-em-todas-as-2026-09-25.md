# Plano MASTER-first — corrigir o Briefing visual (IA) em todas as instalações

## Diagnóstico confirmado

A captura da Casa 8 mostra uma resposta no formato esperado pelo agente, porém com aspas internas não escapadas em exemplos como `"Resultado natural, 30 dias depois"`. Isso torna o JSON inválido.

O fluxo atual tenta interpretar a resposta estruturada. Quando essa validação falha, o fallback aceita qualquer texto com mais de 20 caracteres e o grava integralmente em `posts.design_brief`. Assim, `{ "visual_direction": "..." }` vira o próprio briefing e aparece cru na tela.

O problema não está apenas na apresentação:

- o conteúdo incorreto é persistido no banco;
- ele aparece cru tanto no cartão da tarefa quanto no detalhe da pauta;
- o mesmo briefing contaminado pode ser reutilizado na geração da legenda;
- o fallback equivalente também é usado por roteiro e legenda, portanto os três campos precisam ser protegidos;
- a Casa 8 está em `1.4.37`, mas a lógica defeituosa pertence ao código compartilhado e pode atingir qualquer instalação, provider ou modelo.

No MASTER consultado há 95 briefings visuais preenchidos e nenhum com o invólucro detectável. Isso não comprova os demais ambientes, pois cada instalação possui banco próprio. A Casa 8 precisa ser auditada diretamente durante a execução do plano.

## Objetivo

Garantir que toda saída de IA seja validada e normalizada antes de ser salva, que respostas estruturadas nunca sejam aceitas como prosa por engano e que registros antigos sejam corrigidos sem apagar conteúdo legítimo.

## Implementação

### 1. Corrigir a categoria do erro no parser central

- Extrair a interpretação de respostas de campo único para uma função compartilhada e testável.
- Aplicar esta ordem, sem ambiguidades:
  1. JSON válido e compatível com o schema: usar somente o valor do campo esperado;
  2. JSON ou invólucro reconhecível, mas malformado: recuperar somente o campo esperado quando isso puder ser feito deterministicamente;
  3. prosa real, sem marcadores estruturais: aceitar como fallback textual;
  4. resposta vazia, ambígua ou estruturalmente incompatível: falhar como `ai_invalid_output`, preservando o último dado comprovado.
- Nunca transformar texto que começa como JSON em fallback de prosa contendo o objeto inteiro.
- Suportar cercas Markdown, quebras de linha e aspas não escapadas dentro do valor, incluindo exatamente o formato visto na Casa 8.
- Definir limites de tamanho e rejeitar objetos com campo ausente, tipo inesperado ou estrutura adicional ambígua.

### 2. Proteger todos os caminhos irmãos

Aplicar o mesmo contrato, sem cópias divergentes, a:

- `visual_direction` → `posts.design_brief`;
- `script` → roteiro;
- `caption` → legenda;
- recuperação de respostas preservadas em erros dos providers.

A correção deve reutilizar o salvamento estruturado já existente, em vez de manter parsers diferentes por pipeline ou provider. OpenAI, Anthropic, Gemini e Groq devem produzir o mesmo formato canônico final.

### 3. Garantir persistência canônica

- Antes de qualquer gravação, validar que `design_brief` contém apenas o texto útil, nunca o envelope JSON.
- Antes de reutilizar um briefing existente como contexto da legenda, normalizá-lo pelo mesmo contrato.
- Manter `posts.design_brief` como texto; não criar nova coluna nem mudar o schema sem necessidade.
- Não alterar prompts personalizados, provider escolhido, chaves, RBAC, RLS, autenticação ou dados editoriais válidos.

### 4. Compatibilidade imediata com registros antigos

- Centralizar a leitura do briefing visual por um normalizador compatível com registros legados, para que as duas telas deixem de exibir o JSON cru assim que receberem a nova versão.
- O normalizador deve devolver o texto original quando não reconhecer com segurança um envelope conhecido.
- A interface não deve ocultar silenciosamente um erro: conteúdo irrecuperável continua preservado e é identificado para revisão, sem ser apagado nem substituído por texto inventado.

### 5. Reconciliação segura em cada banco

Criar uma migration nova, forward-only e idempotente; migrations históricas não serão editadas nem reexecutadas.

A migration deverá:

- localizar somente `design_brief` que corresponda integralmente a um envelope conhecido de campo único (`visual_direction` ou alias legado explicitamente confirmado);
- extrair e gravar apenas o texto quando a transformação for determinística;
- não tocar briefings comuns, JSON com múltiplos campos, conteúdo ambíguo ou registros vazios;
- registrar totais de encontrados, corrigidos e deixados para revisão, sem registrar conteúdo sensível;
- produzir o mesmo resultado se executada novamente.

Antes de definir a expressão final da migration, capturar em modo somente leitura exemplos sanitizados de cada classe real encontrada na Casa 8 e nas demais instalações. Se algum formato não puder ser reparado com segurança em SQL, ele ficará preservado e será tratado por reconciliação explícita, nunca por substituição em massa.

### 6. Observabilidade sem expor conteúdo

- Registrar provider, modelo, agente, etapa e classificação da falha, mas não o briefing completo.
- Diferenciar saída válida, prosa aceita, envelope recuperado e saída inválida.
- Não consumir nova tentativa quando a resposta anterior puder ser recuperada deterministicamente.
- Manter retries limitados e sem trocar provider por causa de erro de formatação recuperável.

## Validação obrigatória

### Testes unitários do parser

Cobrir, para `visual_direction`, `script` e `caption`:

1. JSON válido com string;
2. JSON em cerca Markdown;
3. prosa legítima;
4. reprodução exata do padrão da captura, com aspas internas não escapadas;
5. campo como objeto ou array;
6. campo ausente;
7. objeto com campos extras ambíguos;
8. resposta vazia ou truncada;
9. texto contendo chaves que não é JSON;
10. conteúdo em PT-BR preservado sem perda de aspas, acentos ou quebras de linha.

### Testes do fluxo completo

- Gerar peça estática e comprovar que `design_brief` é salvo como texto limpo.
- Confirmar que esse texto, e não o envelope JSON, alimenta a legenda.
- Confirmar que tarefa e detalhe da pauta exibem o mesmo conteúdo normalizado.
- Reexecutar uma peça já pronta sem duplicar geração nem sobrescrever edição manual.
- Testar ao menos um provider com JSON correto e outro com a resposta malformada reproduzida.
- Verificar que falhas definitivas permanecem explícitas e que retries não entram em loop.

### Testes da migration

Para cada classe, usar fixture fiel ao formato real:

- envelope corrigível;
- texto comum que deve permanecer byte a byte igual;
- estrutura ambígua que deve permanecer intocada;
- migration executada duas vezes com o mesmo resultado.

## Entrega e propagação MASTER-first

1. Aplicar código, testes e migration nova no MASTER.
2. Regenerar `007_delta_migrations.sql` com `build_delta.py`.
3. Subir a versão e manter `delta_version.txt`, hash, `MASTER_RELEASE_VERSION` e contrato do control-plane sincronizados.
4. Atualizar `verify-installation-client.sql` para comprovar a presença da migration/reconciliação quando aplicável; não criar checagem artificial de schema se nenhum objeto novo for criado.
5. Rodar `bun run master:check`, testes focados, suíte global, verificação de tipos, lint e build, sem aumentar timeout, pular testes ou mascarar falhas.
6. Ensaiar atualização completa em ambiente descartável autorizado, incluindo registros válidos, corrigíveis e ambíguos.
7. Auditar o banco após o ensaio: nenhum briefing válido alterado, nenhum envelope corrigível restante e nenhuma operação ativa ou versão avançada sem publicação comprovada.
8. Apresentar evidências e solicitar autorização explícita para publicar o MASTER.
9. Após a publicação autorizada, propagar primeiro para a Casa 8 como instalação de validação do incidente, acompanhar até a validação final e conferir a peça reportada.
10. Com a Casa 8 aprovada, atualizar as demais instalações elegíveis uma por vez pelo gerenciador, preservando checkpoints e sem reiniciar operações concluídas.
11. Em cada instalação, confirmar versão publicada, migration aplicada, relatório de saúde aprovado e contagens sanitizadas de registros corrigidos/pendentes.

## Critérios de encerramento

A correção só estará concluída quando:

- novas gerações nunca persistirem o envelope JSON como briefing;
- o caso exato da Casa 8 passar no teste e na instalação real;
- os dois pontos de exibição mostrarem texto limpo;
- registros antigos corrigíveis estiverem reconciliados em todos os ambientes propagados;
- registros ambíguos, se existirem, estiverem preservados e listados para revisão;
- MASTER, pacote, versão, verificador e publicação estiverem sincronizados;
- todas as instalações elegíveis estiverem atualizadas ou explicitamente listadas com seu bloqueador.

## Limites de segurança

- Nenhuma alteração direta isolada na Casa 8 antes da correção no MASTER.
- Nenhuma edição de migration histórica.
- Nenhuma limpeza ampla por regex sem classificação prévia dos dados reais.
- Nenhuma publicação ou propagação sem autorização explícita.
- Nenhuma mudança em RBAC, RLS, autenticação, providers, chaves ou conteúdo válido.
