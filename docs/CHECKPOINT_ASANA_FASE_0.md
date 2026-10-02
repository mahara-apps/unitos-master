# Checkpoint de leitura — preparação para migração Asana

Baseline de referência: MASTER 1.4.61. Pacote local em validação: 1.4.62, SHA do delta `3b8056917ef432f746b5ad451e9ff1f6560a1eff8a9770e05f3e292ec56b0ddf` (não publicado).

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

Checkpoint não é backup nem rollback de banco. Não houve congelamento de jobs ou instalações porque esta etapa não modificou operações duráveis. Reconciliar contagens por workspace e papéis usando fixtures sanitizados antes de liberar a experiência unificada. Nenhuma instalação crítica foi tocada.

Ensaio global no projeto QA descartável: 1879/1882 testes passaram. As três falhas restantes medem permissões EXECUTE de `anon` que o banco QA concede indevidamente (`client_in_scope`, `is_client_assigned`, `card_approval_public_decide` e `public_surface_rate_hit`), enquanto o MASTER as nega. O teste de linhas históricas agora compara IDs reais antes/depois em vez de exigir 20 linhas inexistentes no descartável. O ensaio de projeção autenticado confirma que USER vê apenas as suas Task e Sub-task do cliente atribuído e que Owner vê ambas as origens em dois clientes; não substitui o ensaio da chamada HTTP da função. Nenhuma permissão ou dado do MASTER foi alterado para encobrir a divergência. A reconciliação do descartável exige ação separada e validação posterior antes do aceite da Fase 1.
