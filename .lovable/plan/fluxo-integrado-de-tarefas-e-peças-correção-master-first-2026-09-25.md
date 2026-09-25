# Fluxo integrado de tarefas e peças — correção MASTER-first

## Objetivo
Corrigir no MASTER três falhas do mesmo fluxo: tarefas atribuídas que não aparecem em **Minhas tarefas**, quadro de peças do projeto que parece operacional mas não move, e perda de contexto ao abrir uma peça a partir da tarefa. A solução será propagável às demais instalações sem criar rota, tabela, coluna ou relação nova.

## Diagnóstico confirmado
- **Minhas tarefas** aplica o cliente selecionado antes do filtro de responsável. Assim, tarefas do mesmo workspace em outros clientes acessíveis não chegam à tela.
- Ser responsável por uma tarefa não concede acesso ao cliente. Para Manager/User, a RLS exige atribuição ao cliente; ela será preservada, sem ampliar acesso.
- A relação tarefa–peça já existe em `tasks.post_id`; peças sem esse vínculo não serão associadas por título ou por aproximação.
- O quadro de peças dentro do projeto é apenas visual, embora sua aparência sugira arrastar. O quadro de Conteúdo já possui a movimentação canônica por `stage_id`, validação, ordenação, espelho legado e RLS.
- **Ver peça** fecha a tarefa e navega para Conteúdo. Já existem drawer de tarefa, detalhe de peça e editor de peça que podem ser reaproveitados.

## Solução

### 1. Fazer “Minhas tarefas” representar o workspace acessível
- Na visão **Minhas tarefas**, buscar as tarefas atribuídas ao usuário em todos os clientes do workspace aos quais ele já possui acesso.
- Manter as demais visões limitadas ao cliente ativo, preservando o comportamento atual.
- Aplicar o filtro de responsável no servidor, antes do limite da consulta, evitando que uma lista grande exclua tarefas próprias.
- Manter filtro explícito por cliente na própria tela para o usuário reduzir a lista quando desejar.
- Não alterar RLS: tarefas de clientes sem acesso continuarão invisíveis.

### 2. Impedir atribuições que resultem em tarefa invisível
- Reaproveitar a fonte atual de membros elegíveis e validar, ao criar ou trocar o responsável, se Manager/User possui acesso ao cliente da tarefa.
- Quando não possuir, bloquear a atribuição com mensagem clara, em vez de salvar uma tarefa que o responsável não consegue abrir.
- Owner/Admin/Super Admin continuam seguindo a matriz vigente; nenhum papel ou permissão será ampliado.
- Cobrir criação e edição, inclusive tarefas originadas dentro de projeto/job, para não corrigir apenas uma entrada do fluxo.

### 3. Manter a tarefa como contexto principal de trabalho
- Trocar **Ver peça** por abertura contextual da peça ao lado da tarefa, sem navegar para outro módulo e sem fechar a tarefa.
- Reaproveitar o detalhe/editor já existente; não duplicar formulário de peça.
- Ao fechar a peça, retornar exatamente à mesma tarefa, lista, filtros e posição.
- Preservar a navegação entre tarefas; ao avançar para outra tarefa, atualizar ou fechar corretamente a peça associada.
- Manter **Abrir em Conteúdo** apenas como ação secundária para quem quiser acessar o quadro completo.
- Tarefa sem `post_id` exibirá somente que não há peça vinculada; não será criado vínculo implícito.

### 4. Tornar o quadro de peças do projeto realmente operacional
- Habilitar arrastar somente onde houver `post_id`, `pipeline_id` e `stage_id` reais.
- Passar ao quadro os IDs reais das colunas e reutilizar a mesma função de movimentação já usada em Conteúdo.
- Preservar validação de pipeline, ordenação, atualização otimista com reversão em erro, sincronização do estágio legado e RLS.
- Remover qualquer aparência de arrasto para peças que não possam ser movidas e mostrar o motivo de forma objetiva.
- Não inventar etapas como “Design”: serão usadas as colunas configuradas no pipeline de cada cliente.

## Testes obrigatórios
- **Minhas tarefas:** tarefa própria em outro cliente acessível aparece; tarefa de cliente sem acesso não vaza; filtro de cliente continua funcionando; o limite é aplicado depois do filtro de responsável.
- **Atribuição:** Manager/User sem acesso ao cliente não pode ser escolhido/salvo; perfis autorizados continuam funcionando.
- **Tarefa + peça:** abrir e fechar peça mantém tarefa e filtros; tarefa sem peça permanece estável; troca entre tarefas não mostra a peça anterior.
- **Quadro do projeto:** mover entre colunas persiste `stage_id` e posição; erro reverte a interface; coluna de outro pipeline é rejeitada; permissões atuais são respeitadas.
- **Regressão:** quadro de Conteúdo, projeto, tarefas concluídas/arquivadas, comentários, menções e atalhos atuais continuam funcionando.
- Rodar testes focados, integração de escopo/RLS e a suíte global sem aumentar timeout, pular testes ou mascarar falhas.

## Implementação cautelosa
- Começar pelos testes de regressão que reproduzem os três problemas.
- Fazer alterações pequenas nos fluxos existentes, sem criar páginas ou caminhos paralelos.
- Não alterar schema, dados, auth, papéis ou policies. Se surgir necessidade real de banco, interromper e apresentar a evidência antes de qualquer migration.
- Validar o percurso completo em desktop e mobile: Projeto → tarefa → peça → mover etapa → voltar à tarefa → próxima tarefa.

## Fechamento e propagação MASTER-first
1. Implementar e validar no MASTER.
2. Regenerar o pacote com `build_delta.py`, mesmo sem migration nova, e revisar que o banco permaneceu inalterado.
3. Avançar a versão da release e manter `delta_version.txt` e `MASTER_RELEASE_VERSION` iguais ao SHA gerado.
4. Conferir `verify-installation.sql`; sem objeto novo, registrar que nenhuma checagem estrutural adicional é necessária.
5. Executar `bun run master:check` e a suíte global completa.
6. Com autorização explícita, publicar o MASTER.
7. Atualizar primeiro uma instalação de validação, conferir tarefas, peça contextual, movimentação, RBAC/RLS e dados existentes.
8. Só após sucesso, autorizar **Atualizar** nas demais instalações em ondas, com verificação de versão e saúde após cada uma.

## Critérios de aceite
- Toda tarefa atribuída aparece em **Minhas tarefas** quando o usuário tem acesso ao respectivo cliente.
- Nenhuma atribuição cria uma tarefa invisível ao responsável.
- A peça abre e pode ser trabalhada sem abandonar a tarefa.
- O quadro do projeto move peças pelas regras canônicas ou se apresenta claramente como não movível.
- Nenhum acesso é ampliado e nenhuma instalação recebe tabela, campo, rota ou vínculo artificial.
- MASTER, pacote, versão e verificações terminam sincronizados antes de qualquer propagação.

## Fora de escopo
- Redesenhar os módulos de Projetos, Tarefas ou Conteúdo por inteiro.
- Criar um novo editor de peça, novo Kanban, nova relação no banco ou automação por nome da tarefa.
- Alterar o comportamento de arquivamento de tarefas concluídas sem uma decisão específica posterior.
- Publicar ou atualizar instalações sem autorização explícita.
