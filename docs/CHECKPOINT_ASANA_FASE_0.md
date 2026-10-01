# Checkpoint de leitura — preparação para migração Asana

Baseline registrada: MASTER 1.4.61, SHA do delta `3b8056917ef432f746b5ad451e9ff1f6560a1eff8a9770e05f3e292ec56b0ddf`.

Leitura somente leitura no banco MASTER em 2026-10-01 (UTC), sem dados pessoais:

| Entidade | Total |
|---|---:|
| projetos | 21 |
| Tasks (`project_jobs`) | 26 |
| Sub-tasks (`tasks`) | 220 |
| checklist (`task_subtasks`) | 0 |
| comentários de tarefa | 6 |
| apontamentos de tempo | 11 |
| eventos de atividade | 1415 |

Contrato: Projeto → Task (`project_jobs`) → Sub-task (`tasks.job_id`) → Checklist (`task_subtasks.task_id`). Sub-tasks também podem existir diretamente no projeto ou apenas no workspace/cliente. Peças e pautas permanecem entidades editoriais separadas. A identidade de leitura usa `task:<id>` ou `sub_task:<id>`; mesmo UUID entre origens não implica duplicação. O cliente de Task vem do projeto; o de Sub-task vem da própria linha e é confrontado com o projeto quando presente. Ausência de projeto esperado é erro, nunca lista vazia.

Checkpoint não é backup nem rollback de banco. Não houve congelamento de jobs ou instalações porque esta etapa não modificou operações duráveis. Reconciliar contagens por workspace e papéis usando fixtures sanitizados antes de liberar a experiência unificada. A validação autenticada com os perfis reais depende de ambiente QA utilizável; nenhuma instalação crítica foi tocada.
