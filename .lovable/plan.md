# Projetos > Jobs > Tarefas: hierarquia clara + comentários por nível

Reorganizar a tela do projeto para que a hierarquia fique explícita e navegável, no espírito das referências enviadas, sem quebrar dados, permissões ou fluxos existentes (pauta → produção continua igual).

## Hierarquia final

```text
Projeto  (visão geral: cliente, período, responsável, progresso, comentários do projeto)
  └── Job  (agrupador: "Pautas" automático, "Fazer criativos", "Relatórios"...)
        └── Tarefa  (ex.: Design cria peças, Ajustar peça 2, item de pauta)
```

## 1. Tela do Projeto (Visão geral)

- Cabeçalho enxuto: cliente, período, responsável, status, badge da pauta e progresso — como hoje.
- Bloco **Jobs** como conteúdo principal: lista de jobs em linhas densas com nome, contagem de tarefas concluídas/total, tempo somado, prazo e responsável (padrão da referência "JOBS / Pauta").
- Clicar em um job abre a visão do job (não mais um painel lateral escondido).
- Painel lateral direito com abas **Comentários** e **Histórico** do projeto.
- O bloco atual "Itens da pauta / Peças do projeto" deixa de ser uma seção solta: passa a ser o job **Pautas**.

## 2. Job "Pautas" automático

- Todo projeto com pauta vinculada exibe um job fixo **Pautas**, que lista os itens da pauta (mesma consulta e mesmos estados/badges de hoje, incluindo "Abrir peça").
- Esse job aparece junto dos jobs manuais, mas não pode ser renomeado nem excluído (é derivado da pauta).
- Peças sem tópico de pauta continuam listadas nesse mesmo job, numa subseção "Fora da pauta".

## 3. Visão do Job

- Coluna esquerda: navegação entre jobs do projeto (mantém o comportamento atual do JobsPanel).
- Centro: tarefas do job com checkbox de concluir, responsável, prazo, status, tempo e criação rápida — tudo já existente, apenas reorganizado.
- Direita: **Comentários** do job.
- Breadcrumb `Projeto > Job` para deixar a hierarquia visível.

## 4. Tarefa

- Ao clicar numa tarefa abre o detalhe (drawer/modal) com breadcrumb `Projeto > Job > Tarefa`, campos já existentes (status, responsável, prazo, estimativa, timesheet, subtarefas) e a aba **Comentários** da tarefa, que já existe no banco.

## 5. Comentários / observações em 3 níveis

- Projeto, Job e Tarefa passam a ter seu próprio fio de comentários, com autor, data, avatar e exclusão pelo próprio autor.
- Tarefa reutiliza o que já existe (`task_comments`).
- Projeto e Job usam uma nova tabela de comentários de trabalho, com as mesmas regras de acesso dos projetos (workspace + escopo de cliente).

## Detalhes técnicos

- Banco: nova tabela `public.work_comments` (`brand_id`, `project_id`, `job_id` nullable, `author_id`, `body`, `mentions`), com GRANTs para `authenticated`/`service_role`, RLS habilitada e policies baseadas em `can_access_project(project_id, auth.uid())` para leitura/inserção; exclusão apenas pelo autor. Nenhuma alteração em `tasks`, `project_jobs` ou `task_comments`.
- Novo `src/lib/work-comments.functions.ts` com `listWorkCommentsFn` / `addWorkCommentFn` / `deleteWorkCommentFn` (`createServerFn` + `requireSupabaseAuth`), espelhando o padrão de `tasks.functions.ts`.
- Novo componente `src/components/projects/comment-thread.tsx` (thread genérica) usado nos três níveis; nas tarefas ele consome as funções de `task_comments`.
- `src/routes/_authenticated/projects.$projectId.tsx`: reorganiza a renderização — remove o toggle `showJobs`, promove `JobsPanel` a conteúdo principal, transforma a lista de itens da pauta no job virtual "Pautas" e adiciona o painel de comentários. Nenhuma mudança nas queries `getProject`, `listJobsFn`, `listProjectTasksFn`.
- `src/components/projects/jobs-panel.tsx`: aceita o job virtual "Pautas" (id sintético) sem permitir renomear/excluir, exibe breadcrumb e a coluna de comentários do job.
- `ProjectTasksPanel` deixa de ser uma seção duplicada na visão geral (as tarefas passam a viver dentro dos jobs); o componente permanece no repositório para não quebrar outros usos.
- KPIs/resumos numéricos continuam via `PageKpi`/`PageKpiGrid`; cores e tipografia só por tokens semânticos.
- Ao final: `tsgo --noEmit`, testes relacionados e build.
