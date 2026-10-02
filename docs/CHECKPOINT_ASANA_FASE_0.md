# Checkpoint de leitura — preparação para migração Asana

Baseline de referência: MASTER 1.4.61. Pacote local em validação: 1.4.63, SHA do delta `3b8056917ef432f746b5ad451e9ff1f6560a1eff8a9770e05f3e292ec56b0ddf` (não publicado).

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

Em 2026-10-02, as quatro funções `client_in_scope`, `is_client_assigned`, `card_approval_public_decide` e `public_surface_rate_hit` tiveram EXECUTE de `anon`/`PUBLIC` revogado **somente no QA descartável**, preservando `authenticated` e `service_role`; privilégios efetivos conferidos após recarga do schema. A suíte global passou: **191 arquivos, 1882/1882 testes**, sem pular testes nem aumentar timeouts. O teste de workspace usa a mesma chave QA das demais fixtures e passou. O teste de linhas históricas compara IDs reais antes/depois em vez de exigir linhas inexistentes no descartável.

A projeção autenticada sob RLS confirma que USER vê Task e Sub-task do cliente atribuído, não os itens de outro cliente, enquanto Owner vê as duas origens em dois clientes sem fundi-las. Uma chamada HTTP real a `listWorkItemsFn` no ambiente QA isolado confirmou total de 2 itens visíveis, paginação com limite 1, bloqueio de consulta a outra pessoa e rejeição de token inválido; fixture temporária removida ao final. `master:check` passou em 1.4.63, com versão e SHA sincronizados. **Fases 0 e 1 validadas; MASTER 1.4.63 não publicado e nenhuma instalação atualizada.** As Fases 2–6 aguardam aceite para iniciar; a importação ainda depende de exportação real do Asana.
