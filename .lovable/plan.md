# Projetos > Task > Sub-task

Renomear a hierarquia exibida dentro de Projetos, preservando integralmente o modelo de dados, os recursos existentes e o design system do Unitos.

## Resultado esperado

```text
Projeto
  └── Task       (entidade atual: Job)
        └── Sub-task   (entidade atual: Tarefa)
              └── Checklist   (entidade atual: Subtarefa)
```

- A mudança será apenas de nomenclatura e apresentação.
- Nenhuma tabela, coluna, relacionamento, permissão ou dado existente será migrado.
- Pautas continuarão funcionando e sendo apresentadas como hoje.
- A área global “Minhas tarefas” continuará com seu nome e comportamento atuais; a nova nomenclatura vale no contexto interno de Projetos.

## 1. Nomenclatura na área de Projetos

- Trocar os textos visíveis de **Job/Jobs** para **Task/Tasks**.
- Trocar os textos visíveis de **Tarefa/Tarefas** para **Sub-task/Sub-tasks** quando representarem itens dentro de uma Task.
- Trocar **Subtarefa/Subtarefas** por **Checklist/Itens do checklist** no nível mais baixo.
- Aplicar a nomenclatura de forma consistente em títulos, breadcrumbs, abas, botões, menus, confirmações, estados vazios, busca, filtros, agrupamentos, mensagens de sucesso/erro e acessibilidade.
- Manter termos internos como `project_jobs`, `job_id`, funções e tipos atuais para evitar qualquer risco aos dados e às integrações.

## 2. Telas afetadas

- Visão geral do projeto: “Resumo de jobs” e ações de criação passam a usar **Tasks**.
- Lista e quadro: cabeçalhos, contagens, agrupamentos e ações passam a distinguir **Tasks** e **Sub-tasks**.
- Modal atual de Job: passa a ser apresentado como detalhe da **Task**.
- Linhas e detalhe da tarefa atual: passam a ser apresentados como **Sub-task** dentro do projeto.
- Popover de subtarefas atual: passa a ser **Checklist**, preservando inclusão, conclusão, ordenação e exclusão.
- Menus de duplicar, concluir, arquivar, reabrir e excluir passam a nomear corretamente o nível afetado.
- Modelos de projeto e duplicação mantêm a mesma estrutura interna, mas exibem **Task**, **Sub-task** e **Checklist** onde houver texto para o usuário.
- Comentários, briefing, responsáveis, status, datas, timers e histórico mantêm exatamente os recursos e vínculos atuais.

## 3. Compatibilidade de contexto

- Componentes compartilhados com “Minhas tarefas” receberão nomenclatura contextual: **Sub-task** dentro de Projetos e **Tarefa** na área global.
- Textos de Pautas e Peças não serão renomeados; apenas referências explícitas ao item operacional associado poderão dizer **Sub-task**, sem mudar o fluxo.
- URLs, parâmetros de busca, links diretos e identificadores permanecem inalterados.
- Relatórios e registros históricos mantêm seus dados e agregações; somente rótulos visíveis no contexto do projeto serão ajustados.

## 4. Validação

- Testar criação, edição, duplicação, conclusão, arquivamento e exclusão de Tasks e Sub-tasks.
- Testar checklist, responsáveis, status, prazos, comentários, briefing e timer.
- Confirmar que Pautas, Peças, modelos de projeto, duplicação de projeto e links diretos continuam funcionando.
- Confirmar que “Minhas tarefas” não mudou de escopo nem de comportamento.
- Revisar desktop e mobile, incluindo textos longos, tooltips e leitores de tela.
- Atualizar testes de interface que hoje verificam os rótulos antigos; executar testes focados, TypeScript, lint, suíte global e `bun run master:check`, sem relaxar timeouts ou ocultar falhas.

## 5. Entrega MASTER-first

1. Aplicar a mudança no código do MASTER, sem migration de banco.
2. Regenerar o pacote com `build_delta.py`.
3. Atualizar `delta_version.txt` e `MASTER_RELEASE_VERSION` com a mesma nova versão.
4. Manter o verificador de instalação sem nova checagem estrutural, pois não haverá alteração de banco.
5. Executar `bun run master:check` e as validações descritas.
6. Publicar o MASTER somente após autorização explícita.
7. Atualizar cada instalação somente após autorização separada, confirmando a nomenclatura após cada atualização.

## Fora de escopo

- Renomear tabelas, colunas, RPCs ou tipos internos.
- Migrar ou reorganizar dados existentes.
- Alterar RBAC, RLS, autenticação, status, responsáveis ou regras de negócio.
- Redesenhar o design system.
- Alterar o funcionamento ou a posição de Pautas.
