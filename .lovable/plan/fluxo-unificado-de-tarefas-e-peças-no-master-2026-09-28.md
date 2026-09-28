# Fluxo unificado de tarefas e peças no MASTER

## Objetivo

Tornar clara e contínua a relação entre projeto, job, tarefa, pauta e peça, corrigindo o desaparecimento de tarefas em “Minhas tarefas” e preservando integralmente RBAC, RLS, autenticação, dados e o design system atual do Unitos.

## Comportamento definido

- **Peça e tarefa continuam independentes:** cada uma mantém seu próprio responsável e estado.
- **Ao gerar a tarefa de produção:** o responsável da peça aparece como sugestão, desde que ainda tenha acesso ao cliente, mas a criação exige confirmação explícita. Sem responsável elegível, a escolha começa vazia.
- **Após a criação:** trocar o responsável da peça não altera a tarefa, e trocar o responsável da tarefa não altera a peça.
- **“Minhas tarefas”:** sempre abre com os filtros extras limpos e mostra todas as tarefas atribuídas à pessoa no workspace e nos clientes que ela já pode acessar.

## Experiência proposta

### 1. Linguagem inequívoca

- Renomear os campos conforme o registro alterado:
  - **Responsável pela peça**;
  - **Etapa da peça**;
  - **Responsável pela tarefa**;
  - **Status da tarefa**.
- No detalhe da pauta, separar visualmente **Peça** e **Execução**, sem criar um novo padrão visual.
- Manter status, seletores, linhas, drawers, botões, espaçamento e tokens já usados no Unitos.

### 2. Criação da tarefa de produção

- Inserir uma confirmação curta antes de materializar a tarefa, exibindo peça, projeto, prazo e responsável sugerido.
- Validar no servidor se o responsável escolhido pertence ao workspace e já pode acessar o cliente.
- Não conceder acesso automaticamente e não criar atribuição invisível.
- Preservar a garantia de uma tarefa de produção por peça e o vínculo existente entre ambas.
- Se a tarefa já existir, abrir o vínculo existente em vez de criar outra.

### 3. “Minhas tarefas” coerente

- Ao entrar pela visão “Minhas tarefas”, remover busca, cliente, projeto, status, prazo, arquivamento e demais filtros residuais; manter apenas a visão pessoal e o padrão de ocultar concluídas.
- Aplicar o responsável no servidor antes da paginação e percorrer o conjunto completo, sem teto silencioso que esconda tarefas antigas.
- Manter RLS como autoridade final e não ampliar o universo de clientes acessíveis.
- Exibir separadamente carregamento, erro, ausência real de tarefas e nenhum resultado após filtros aplicados posteriormente.
- Fazer contador, lista, quadro, calendário e linha do tempo partirem do mesmo conjunto; nas visões por data, informar tarefas sem data em vez de fazê-las desaparecer silenciosamente.

### 4. Navegação sem perda de contexto

Implementar o percurso:

```text
Projeto > Job/Pauta > Tarefa > Peça
                 < voltar preservando o contexto
```

- Fazer a tarefa listada no detalhe da pauta abrir o drawer de tarefa existente.
- Na tarefa vinculada, abrir a peça em uma camada sobre a tarefa, sem trocar de página.
- Ao fechar a peça, retornar à mesma tarefa; ao fechar a tarefa, retornar à mesma pauta/job, preservando posição e seleção.
- Exibir breadcrumb e ações claras de retorno, usando os componentes atuais.
- Suspender atalhos da camada inferior enquanto a peça estiver aberta, evitando fechamento ou navegação acidental.

### 5. Quadro de peças

- Manter o responsável da peça no cartão e a etapa real do pipeline como coluna.
- Reutilizar a movimentação canônica já existente, com IDs reais de peça, pipeline, etapa e posição.
- Itens ainda não materializados como peça permanecem informativos, sem aparência arrastável.
- Em erro de rede ou permissão, reverter o cartão e preservar o estado comprovado.

## Segurança e integridade

- Não alterar papéis, políticas, autenticação ou escopo de acesso.
- Não sincronizar responsáveis ou estados silenciosamente.
- Não corrigir registros existentes em massa. Primeiro criar uma auditoria somente leitura para localizar peças e tarefas vinculadas com responsáveis divergentes ou ausentes; qualquer reparação de dados será proposta separadamente.
- Reutilizar os campos e vínculos atuais; não criar tabela ou coluna sem necessidade comprovada.
- Erro de leitura nunca será tratado como lista vazia, ausência, sucesso ou reinício.

## Validação obrigatória

### Testes comportamentais

- tarefa atribuída aparece em “Minhas tarefas” independentemente do cliente ativo e da idade do registro;
- entrada em “Minhas tarefas” limpa filtros residuais;
- RLS continua ocultando clientes sem acesso;
- sugestão de responsável elegível, ausência real e responsável sem acesso;
- confirmação cria uma única tarefa; clique duplo e replay não duplicam;
- peça e tarefa permanecem independentes após alterações posteriores;
- contador e todas as visões usam o mesmo conjunto;
- estados de erro, vazio e resposta válida são distintos;
- navegação projeto → pauta/job → tarefa → peça → retorno preserva o contexto;
- movimentação de peça usa etapa real e reverte corretamente em falha.

### Ensaio e regressão

- Reproduzir o caso observado com dados sanitizados da instalação correta antes de declarar a causa encerrada.
- Testar conjuntos acima do limite padrão, tarefas antigas, sem data, concluídas e arquivadas.
- Validar desktop e celular no percurso completo.
- Rodar testes focados, typecheck, lint, build, suíte global sem relaxar timeout ou ocultar falhas e `bun run master:check`.

## Entrega MASTER-first

1. Implementar e validar tudo no MASTER.
2. Evitar migration se a solução permanecer apenas nos campos e funções existentes; se surgir necessidade comprovada, criar migration aditiva com GRANTs, RLS e verificação correspondente.
3. Regenerar o delta, atualizar SHA, versão e `MASTER_RELEASE_VERSION`, e manter os artefatos do control-plane sincronizados.
4. Apresentar inventário de mudanças, testes, auditoria e eventuais bloqueadores.
5. Solicitar autorização explícita para publicar o MASTER.
6. Depois da publicação, solicitar autorização separada para atualizar uma instalação piloto.
7. Validar a instalação piloto diretamente antes de propor a propagação para as demais instalações.

## Critérios de aceite

- “Minhas tarefas” não perde tarefas atribuídas por cliente ativo, filtro antigo ou limite silencioso.
- O usuário entende claramente quando edita a peça ou a tarefa.
- A tarefa de produção nasce com responsável confirmado e elegível, sem conceder acesso.
- Peça e tarefa mantêm responsáveis e estados independentes.
- O percurso completo não retira o usuário do projeto nem perde seu contexto.
- Nenhum dado existente é alterado automaticamente e nenhuma permissão é ampliada.
- MASTER, pacote, versão e verificação permanecem sincronizados antes de qualquer publicação.
