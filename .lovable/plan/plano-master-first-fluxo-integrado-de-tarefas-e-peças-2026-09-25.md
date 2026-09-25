# Plano MASTER-first — fluxo integrado de tarefas e peças

## Objetivo

Corrigir no MASTER três fricções do mesmo fluxo, preservando dados e regras existentes:

1. “Minhas tarefas” deve mostrar todas as tarefas atribuídas ao usuário dentro do workspace e dos clientes que ele já pode acessar, independentemente do cliente atualmente selecionado.
2. O quadro de peças do projeto deve deixar claro e funcional o avanço entre etapas permitidas do pipeline.
3. “Ver peça” deve abrir a peça sem retirar o usuário da tarefa, permitindo voltar e seguir para a próxima peça/tarefa no mesmo contexto.

## Limites de segurança

- Não criar tabela, coluna, migration ou rota nova para resolver este fluxo.
- Reutilizar `tasks.assignee_id`, `tasks.post_id`, estágios e posições já existentes.
- Reutilizar as funções canônicas de leitura/movimentação de tarefas e peças.
- Não ampliar RBAC/RLS, não contornar permissões e não alterar autenticação.
- Não modificar conteúdo editorial nem vínculos existentes durante a atualização.
- Publicação e propagação somente após validação completa e autorização explícita.

## Implementação

### 1. Corrigir “Minhas tarefas” na origem

- Separar a visão pessoal do filtro global de cliente ativo.
- Consultar tarefas no workspace com filtro de responsável aplicado no servidor, antes do limite da consulta.
- Manter RLS e os escopos de cliente/projeto como autoridade final: o usuário verá apenas o que já pode acessar.
- Preservar as demais visões, filtros, arquivamento, busca e paginação atuais.

### 2. Evitar novas atribuições invisíveis

- Nas operações existentes de criar e editar tarefa, validar que o responsável pertence ao workspace e já tem acesso ao cliente associado.
- Usar o helper/RPC canônico de acesso; não inferir autorização por rótulos de papel.
- Bloquear apenas a atribuição inconsistente, com mensagem clara, sem conceder acesso automaticamente.
- Aplicar a mesma validação às tarefas criadas dentro de jobs/projetos.

### 3. Manter a peça no contexto da tarefa

- Trocar a navegação de “Ver peça” pela abertura do editor existente em uma camada lateral sobre a tarefa.
- Carregar o contexto real da peça — cliente, pipeline e estágios — sob as mesmas políticas de acesso.
- Ao fechar a peça, retornar exatamente à tarefa aberta, preservando lista, filtros e posição.
- Suspender atalhos de navegação/fechamento da tarefa enquanto o editor da peça estiver aberto.
- Exibir carregamento e erro sem fechar a tarefa nem redirecionar para Conteúdo.

### 4. Tornar o quadro do projeto operacional

- Alimentar o quadro com os IDs reais de post, estágio, pipeline e posição já disponíveis.
- Reutilizar a operação canônica de movimentação de peça, incluindo espelhamento do estágio legado e eventos existentes.
- Permitir arrastar apenas peças reais e somente quando houver pipeline válido; itens apenas planejados continuam informativos.
- Ao soltar, calcular posição pelo padrão atual do board de Conteúdo, atualizar otimisticamente quando seguro e reconciliar pelas queries existentes.
- Se a permissão negar a movimentação, reverter visualmente e mostrar o erro; nunca ampliar acesso para “fazer funcionar”.
- Quando não houver estágios reais, manter o quadro-resumo sem aparência enganosa de drag-and-drop.

## Validação

### Testes focados

- “Minhas tarefas” ignora o cliente ativo, filtra por responsável no servidor e respeita RLS.
- As outras visões continuam respeitando o cliente selecionado.
- Atribuição válida funciona; membro sem acesso ao cliente é recusado sem alterar permissões.
- “Ver peça” abre e fecha no contexto da tarefa, sem mudança de rota.
- Atalhos da tarefa não interferem no editor da peça.
- O quadro move peças entre estágios reais usando a função canônica e mantém a posição correta.
- Falhas de autorização ou rede não deixam o cartão em estado visual incorreto.
- Itens sem post ou pipeline não recebem affordance de arrastar.

### Regressão obrigatória

- Typecheck, lint e testes focados sem relaxar timeout ou ignorar falhas.
- Suíte global completa no ambiente de teste autorizado.
- Teste autenticado do percurso: projeto → tarefa atribuída → Minhas tarefas → Ver peça → fechar → próxima tarefa → mover peça no projeto.
- Conferência explícita de que nenhuma migration, tabela, campo ou rota foi adicionada.

## Fechamento e propagação

1. Concluir código e testes no MASTER.
2. Gerar o delta com `build_delta.py`, mesmo sem migration, conforme o protocolo do repositório.
3. Sincronizar `delta_version.txt`, `MASTER_RELEASE_VERSION`, SHA e metadados do control-plane.
4. Atualizar `verify-installation.sql` apenas se houver uma verificação real aplicável; não inventar checagem de schema.
5. Executar `bun run master:check`, suíte global, typecheck, lint e build.
6. Atualizar primeiro o ambiente de teste autorizado e repetir o percurso autenticado com dados existentes preservados.
7. Apresentar evidências e pedir autorização explícita para publicar o MASTER.
8. Após autorização, propagar em ondas: uma instalação piloto, validação de saúde e fluxo, depois as demais instalações elegíveis.
9. Em cada ambiente, confirmar versão, publicação, ausência de operação pendente e funcionamento do fluxo sem mudança de RBAC/RLS.

## Critérios de aceite

- Tarefa atribuída aparece em “Minhas tarefas” quando o usuário já possui acesso, independentemente do cliente ativo.
- Nenhuma atribuição nova cria tarefa invisível para o responsável.
- A peça abre e fecha dentro do contexto da tarefa, sem redirecionamento.
- Peças reais podem avançar no quadro do projeto conforme as permissões existentes.
- Nenhuma nova rota, campo ou migration foi necessária.
- MASTER e instalações propagadas permanecem sincronizados e passam nas verificações obrigatórias.
