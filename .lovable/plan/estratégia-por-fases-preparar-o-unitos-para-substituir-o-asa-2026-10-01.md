# Estratégia por fases — preparar o Unitos para substituir o Asana

## Objetivo

Evoluir o Unitos até sustentar a operação diária da agência com segurança, sem tentar construir tudo ao mesmo tempo e sem antecipar particularidades do Asana que ainda não conhecemos.

A execução será sequencial. Cada fase gera uma entrega utilizável, passa por um checkpoint técnico e operacional e só então libera a próxima.

## Situação confirmada

- O Unitos já possui projetos, Tasks (`project_jobs`), Sub-tasks (`tasks`) e checklist (`task_subtasks`), embora a área global de Tarefas hoje seja alimentada apenas por `tasks`.
- “Minhas tarefas” já filtra o responsável no servidor, percorre resultados paginados e mantém a RLS como limite de acesso.
- A área de Tarefas já oferece lista, Kanban, calendário, timeline e itens “Sem prazo”.
- O calendário principal atual reúne publicações e eventos; o calendário de tarefas permanece separado.
- Já existem comentários de tarefa, apontamentos de tempo, links de trabalho, notificações e histórico parcial em `activity_events`.
- As tabelas operacionais verificadas estão com RLS habilitada. A autorização real continua no servidor e no banco.
- O pacote MASTER já possui guardiões para delta, versão, instalação, ACL e atualização determinística. A baseline atual é a versão 1.4.61.

## Regra de execução entre fases

Cada fase seguirá este ciclo:

```text
baseline → implementação no MASTER → testes focados → ensaio integrado
→ delta/versão/verificação sincronizados → master:check → revisão
→ autorização para publicar → piloto autorizado → auditoria pós-piloto
```

- Não editar migrations históricas; toda mudança de banco será forward-only.
- Não transformar dados existentes em massa sem auditoria e autorização próprias.
- Tabelas novas terão GRANT explícito, RLS, revogação de `anon`, índices e cobertura no verificador da instalação.
- Erro, ausência real e resposta válida serão estados separados.
- A suíte global não terá timeout aumentado, testes pulados ou falhas mascaradas.
- Publicar o MASTER e atualizar uma instalação serão autorizações separadas.
- Se uma fase falhar no piloto, a próxima fica bloqueada; não se tenta corrigir diretamente na instalação.

---

## Fase 0 — Checkpoint e contrato operacional

### Entrega

Congelar a 1.4.61 como referência comparável e definir formalmente o significado de Projeto → Task → Sub-task → Checklist sem renomear ou fundir tabelas existentes.

### Trabalho

1. Registrar versão, SHA, manifesto, migrations, verificações e resultados dos testes da baseline.
2. Criar fixtures sanitizados representando projeto, Task, Sub-task, checklist, responsável, cliente, prazo, status, comentários, horas, pauta e peça vinculada.
3. Criar testes de caracterização dos fluxos atuais e da matriz Owner/Admin/Manager/User.
4. Criar inventário somente leitura de cardinalidade e vínculos para detectar desaparecimento, duplicação ou mudança indevida de escopo.
5. Definir uma identidade canônica de item de trabalho: tipo de origem + ID + workspace + cliente + projeto.
6. Definir quais ações pertencem a Task, Sub-task e checklist, mantendo pauta e peça como entidades editoriais independentes.

### Critério de saída

Baseline reproduzível, testes verdes e contrato aprovado. Nenhuma experiência do usuário ou dado existente muda nesta fase.

---

## Fase 1 — Camada unificada de leitura

### Entrega

Uma fonte única, inicialmente somente leitura, capaz de apresentar Tasks e Sub-tasks juntas sem duplicar nem reclassificar registros.

### Trabalho

1. Criar projeção paginada com tipo, título, cliente, projeto, responsável, status, prioridade, início, prazo e origem.
2. Aplicar filtro de responsável e escopo por cliente antes da paginação.
3. Manter a RLS como autoridade final e validar acesso também no servidor.
4. Separar carregamento, erro, ausência real e nenhum resultado de filtro.
5. Criar testes acima do limite padrão, outro workspace, cliente não atribuído, registros antigos, concluídos, arquivados e sem prazo.
6. Comparar a projeção nova com as fontes atuais sem alterar as telas principais.

### Critério de saída

Totais reconciliados com as fontes existentes, nenhuma duplicação e nenhum item fora do escopo. Se houver divergência, ela vira relatório; não será “corrigida” automaticamente.

---

## Fase 2 — “Meu trabalho” como caixa diária

### Entrega

Evoluir “Minhas tarefas” para uma visão diária unificada de Tasks e Sub-tasks atribuídas à pessoa.

### Escopo mínimo

- Hoje;
- Próximos dias;
- Atrasadas;
- Sem prazo;
- Concluídas;
- agrupamento por cliente, projeto, prazo, status e tipo;
- busca e filtros preserváveis;
- abertura do item correto sem perder o contexto.

### Limite desta fase

As primeiras ações continuam usando os comandos canônicos de cada entidade. Não haverá edição em massa nem sincronização silenciosa entre Task, Sub-task, pauta e peça.

### Critério de saída

Uma pessoa que atende vários clientes encontra todo o trabalho que lhe foi atribuído, sem enxergar clientes não autorizados e sem precisar alternar telas para descobrir pendências.

---

## Fase 3 — Atribuição horizontal segura

### Entrega

Permitir que membros autorizados criem e distribuam trabalho para outras pessoas sem produzir tarefas invisíveis ou ampliar acesso indevidamente.

### Trabalho

1. Mostrar somente responsáveis elegíveis para o cliente e workspace.
2. Revalidar elegibilidade no servidor no momento de salvar.
3. Bloquear atribuição quando o destinatário perder acesso antes da confirmação.
4. Notificar atribuição, mudança de responsável e mudança de prazo com deduplicação.
5. Registrar no histórico quem alterou, o que mudou e quando.
6. Manter papel, perfil de módulo e vínculo com cliente como controles independentes.

### Critério de saída

Criação e redistribuição funcionam entre pessoas que atendem dois ou três clientes, com testes negativos de usuário forjado, acesso revogado e outro workspace.

---

## Fase 4 — Calendário operacional unificado

### Entrega

Uma agenda única de consulta para trabalho operacional e editorial, sem fundir seus estados.

### Trabalho

1. Projetar Task, Sub-task, pauta, peça, publicação e compromisso com identidade e origem explícitas.
2. Adicionar filtros por tipo, cliente, projeto, responsável, equipe e status.
3. Manter uma área própria para itens sem prazo.
4. Abrir cada item em seu fluxo original e preservar o contexto de retorno.
5. Começar somente leitura; reagendamento por arrastar fica bloqueado até cada origem ter contrato de escrita e reversão comprovado.

### Critério de saída

Os totais do calendário reconciliam com as fontes, um item relacionado não aparece como cópia indevida e falha em uma fonte não transforma a agenda em vazio ou sucesso parcial silencioso.

---

## Fase 5 — Colaboração mínima para abandonar novas demandas no Asana

### Entrega

Completar o necessário para que novas demandas diárias já possam nascer no Unitos.

### Ordem interna

1. **Histórico operacional:** atribuição, prazo, status, conclusão, reabertura e comentários.
2. **Arquivos da tarefa:** múltiplos anexos, autor/data, visualização/download, escopo herdado e fingerprint contra repetição.
3. **Links:** consolidar os links existentes no detalhe de Task e Sub-task.
4. **Notificações:** menção, comentário, vencimento, atraso e desbloqueio, com preferências e deduplicação.

Cada item acima terá seu próprio checkpoint; não serão entregues como um pacote indivisível.

### Critério de saída

Uma demanda nova consegue ser criada, atribuída, discutida, documentada e concluída inteiramente no Unitos, com histórico auditável e acesso correto.

---

## Fase 6 — Gestão e capacidade mínima

### Entrega

Dar ao gestor visão da operação sem criar um módulo avançado de planejamento antes de conhecer a necessidade real.

### Indicadores

- trabalho aberto por pessoa;
- atrasado;
- sem prazo;
- sem responsável;
- estimado versus realizado;
- distribuição por cliente e projeto;
- gargalos por status.

Todos os resumos numéricos usarão `PageKpi`/`PageKpiGrid` e a mesma projeção operacional das telas, evitando números divergentes.

### Critério de saída

Gestores conseguem identificar sobrecarga e lacunas de planejamento a partir dos mesmos registros vistos pela equipe.

---

## Fase 7 — Descoberta do Asana

### Entrada necessária

Exportação ou amostra representativa do ambiente real do cliente.

### Trabalho

Inventariar equipes, projetos, seções, tarefas, subtarefas, responsáveis, seguidores, datas, comentários, anexos, dependências, recorrências, tags, campos personalizados, formulários, regras, modelos, portfólios e integrações.

Produzir a matriz:

```text
Recurso do Asana | uso real | destino no Unitos | já atende | lacuna | decisão
```

### Critério de saída

Todo recurso usado pelo cliente possui destino aprovado, exceção documentada ou decisão explícita de não migrar.

---

## Fase 8 — Paridade orientada pela descoberta

### Entrega

Implementar somente as lacunas comprovadas na Fase 7, uma categoria por vez.

### Ordem provável, sujeita ao inventário

1. dependências e bloqueios;
2. recorrência;
3. campos personalizados essenciais;
4. automações realmente utilizadas;
5. seguidores e notificações adicionais;
6. relatórios específicos.

Cada categoria será uma subfase com migration, testes, piloto e aceite próprios.

---

## Fase 9 — Importador durável do Asana

### Entrega

Importação simulável, retomável, auditável e idempotente.

### Fluxo

```text
descoberta → mapeamento → simulação sem escrita → aprovação
→ importação em lotes → reconciliação → relatório de exceções
```

### Proteções

- operação e item de origem com identidade canônica e fingerprint;
- ledger e checkpoints monotônicos;
- efeito e checkpoint atômicos quando possível;
- lease, heartbeat e fencing;
- erro transitório não vira ausência;
- falha anterior ao destino não consome tentativa do destino;
- resposta vazia inesperada não reinicia do zero;
- reexecução não duplica usuários, projetos, tarefas, comentários ou arquivos;
- nenhuma evidência é apagada para “limpar” a operação.

### Critério de saída

Ensaio completo com estado sanitizado equivalente ao real, incluindo timeout, perda de resposta, crash após commit e replay, com reconciliação de totais e auditoria direta dos efeitos.

---

## Fase 10 — Piloto e corte operacional

### Piloto

- um cliente;
- dois ou três projetos;
- perfis administrativos e operacionais;
- tarefas com comentários, arquivos, prazos e responsáveis;
- pelo menos um caso de dependência ou recorrência usado pelo cliente.

### Corte

1. Congelar novas alterações no Asana.
2. Executar importação incremental final.
3. Reconciliar usuários, projetos, trabalho, responsáveis, prazos, comentários e arquivos.
4. Validar acessos com perfis reais.
5. Tornar o Asana somente leitura durante a contingência.
6. Operar exclusivamente no Unitos.
7. Desativar o Asana somente após aceite formal.

### Critério de encerramento

Todo trabalho ativo está no Unitos; ninguém depende do Asana para operar; exceções históricas estão documentadas; reexecutar a importação não duplica dados; gestores e equipe validaram o fluxo real.

## Primeiro ciclo recomendado

Começar apenas pelas **Fases 0 e 1**. Elas criam o checkpoint e a camada segura sobre a qual “Meu trabalho” será construído. Ao final, apresentar evidências e pedir aceite antes de iniciar a Fase 2.

## Fora do primeiro ciclo

- importação de qualquer dado do Asana;
- alteração em instalação de cliente;
- publicação;
- fusão ou renomeação física de tabelas;
- reparação automática de dados históricos;
- dependências, recorrência e campos personalizados sem confirmação do uso real.
