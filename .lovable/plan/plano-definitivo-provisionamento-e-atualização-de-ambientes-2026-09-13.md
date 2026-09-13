# Plano definitivo — Provisionamento e atualização de ambientes

## Objetivo e critérios de sucesso

Substituir o fluxo frágil baseado em cron HTTP por uma orquestração durável, retomável e observável, sem perder RBAC, RLS, autenticação, isolamento multi-tenant ou compatibilidade com instalações existentes.

Critérios de aceite globais:
- nenhuma operação permanece `running` sem lease válida, heartbeat recente e trabalho agendado;
- toda falha possui etapa, tentativa, classe, código, mensagem sanitizada e ação recomendada;
- repetir uma operação nunca duplica efeitos nem reutiliza checkpoint incompatível;
- migration com mesmo ID e conteúdo diferente é bloqueada antes de alterar o destino;
- banco, código, deploy, manutenção e versão final são reconciliados antes do sucesso;
- criação inicia em segundos, sem aguardar cron; retries respeitam um único contador;
- cron deixa de ser executor principal e vira apenas reconciliação de baixa frequência;
- nenhuma instalação é publicada ou atualizada sem autorização explícita.

Metas operacionais após estabilização, excluindo indisponibilidade declarada dos provedores:
- despacho inicial p95 abaixo de 10 segundos;
- operação interrompida detectada em até 5 minutos;
- 0 falhas silenciosas e 0 operações órfãs após reconciliação;
- atualização p50 abaixo de 5 minutos e p90 abaixo de 15 minutos;
- provisionamento p50 abaixo de 15 minutos e p90 abaixo de 30 minutos.

## Arquitetura-alvo

```text
Solicitação autenticada
  → transação cria operação + tentativa + primeiro item da outbox
  → disparo imediato para executor externo durável, com callback assinado
  → worker adquire lease/fencing e executa uma atividade curta e idempotente
  → transação grava resultado + ledger + próximo item
  → próximo item é disparado imediatamente ou agendado para retry
  → reconciliador de baixa frequência recupera somente lacunas reais
  → verificação final compara MASTER, banco, código, deploy e health
  → sucesso ou estado terminal diagnosticado
```

Decisões obrigatórias:
- usar rotas TanStack em `/api/public/*` para callbacks assinados; não criar Edge Functions;
- usar um agendador/fila externa com entrega atrasada e assinatura para callbacks; não criar novos callbacks HTTP com `pg_cron`/`pg_net`;
- manter PostgreSQL como fonte de verdade de operações, tentativas, checkpoints, outbox e efeitos;
- limitar cada atividade ao orçamento seguro do runtime e encadear a próxima sem aguardar um cron periódico;
- manter apenas reconciliação SQL de baixa frequência para estados puramente internos, ou callback externo de recuperação quando houver trabalho externo.

## Fase 0 — Contenção operacional e linha de base

1. Congelar publicação/propagação do instalador durante a mudança.
2. Registrar uma fotografia read-only: operações por estado, leases vencidas, duração por etapa, taxa de falha, tamanho da fila, 504, build e versão de cada instalação.
3. Confirmar qual commit/release está realmente publicado no MASTER e impedir divergência entre código local e runtime publicado.
4. Definir SLOs, orçamento por atividade, limites por provedor e política de retenção.
5. Selecionar/configurar o executor externo durável e seu segredo de assinatura, sem armazenar credenciais em tabelas.
6. Preparar runbook de incidente e regra de congelamento: nenhuma operação destrutiva enquanto runtime, banco ou provedor estiver degradado.

Aceite: baseline mensurável, executor escolhido, autenticação definida e nenhuma mudança propagada.

## Fase 1 — Modelo durável e transacional

Criar no MASTER, com grants mínimos e RLS:
- `installation_operation_attempts`: uma linha por tentativa real;
- `installation_operation_steps`: máquina de estados por etapa;
- `installation_operation_effects`: ledger de efeitos externos e chaves idempotentes;
- `installation_operation_outbox`: comandos pendentes, agendados, entregues e falhos;
- `installation_migration_ledger`: migration, hash, predecessora, release e resultado;
- campos de compatibilidade em `installation_operations`: versão do workflow, baseline ID/hash, próximo comando, heartbeat, motivo de bloqueio e estado reconciliado.

Regras:
- criação da operação, primeira tentativa e outbox na mesma transação;
- uma operação ativa por instalação preservada;
- uma tentativa incrementada somente ao iniciar execução, nunca ao agendar retry;
- toda mutação exige lease owner + fencing token;
- transições validadas por RPCs `SECURITY DEFINER` com `search_path` fixo e `EXECUTE` restrito ao serviço;
- nenhuma credencial ou payload sensível em detalhes, métricas ou logs;
- índices seletivos para fila pronta, lease vencida, instalação ativa, idempotência e histórico recente;
- retenção/arquivamento para impedir crescimento ilimitado do histórico.

Aceite: invariantes provadas por testes concorrentes e `verify-installation.sql` cobrindo estruturas, grants, RLS, funções e índices.

## Fase 2 — Executor e lifecycle

1. Separar claim, resolução de instalação, credenciais e execução dentro de isolamento por operação.
2. Se uma operação do lote falhar, as demais continuam e recebem diagnóstico próprio.
3. Executar atividades curtas: preflight, repositório, banco, secrets, deploy, health e reconciliação.
4. Heartbeat renovar lease; perda de lease interromper qualquer gravação posterior.
5. Persistir o próximo comando antes de responder ao callback.
6. Retries classificados:
   - transitório: backoff com jitter e limite;
   - permanente/permissão/configuração: `blocked`;
   - resultado desconhecido: `manual_review` ou reconciliação, nunca repetição cega;
   - cancelamento: `cancelled`, com compensação quando aplicável.
7. Finalização torna-se obrigatória e transacional; remover `catch` silencioso dos caminhos críticos.
8. Reconciliador identifica: lease vencida, outbox ausente, tentativa sem término, efeito externo sem confirmação e instalação apontando para operação terminal.
9. Desativar o executor legado somente após drenagem e compatibilidade comprovada.

Aceite: crash em qualquer fronteira retoma sem duplicar efeito; toda operação converge para estado executável ou terminal.

## Fase 3 — Checkpoints e migrations determinísticas

1. Isolar checkpoint por `operation_id + workflow_version + baseline_id + baseline_hash + arquivo`.
2. Eliminar busca nas últimas operações; retomada só lê a própria operação.
3. Falha ao ler ou salvar checkpoint interrompe com diagnóstico; nunca retornar `{}` silenciosamente em operação cercada por fencing.
4. Gerar manifesto imutável com ID, SHA-256, predecessora, ordem e release.
5. Ledger decide por ID + hash:
   - mesmo ID/hash: já aplicado;
   - mesmo ID/hash diferente: bloqueio por divergência;
   - predecessora ausente/ordem inválida: bloqueio antes do SQL.
6. Proibir edição de migration publicada via guardião no CI/MASTER.
7. Tornar DDL idempotente onde semanticamente seguro; dependências adiadas preservam SQLSTATE, mensagem e comando sanitizado.
8. Consolidar um novo baseline estrutural para instalações novas, mantendo caminho incremental explícito para legadas.
9. Comparar versões semanticamente, não por string, e validar equivalência do schema após instalação/update.

Aceite: instalação limpa é equivalente ao MASTER; replay integral não altera resultado; divergência de hash falha antes de mutação.

## Fase 4 — Provisionamento e update como sagas

Provisionamento:
- preflight completo antes de efeitos;
- criar/vincular recursos com chaves idempotentes e IDs externos persistidos;
- aplicar baseline consolidado;
- configurar secrets sem registrá-los no banco;
- publicar código, aguardar build, configurar serviços e validar;
- paralelizar somente atividades sem dependência e com compensação definida.

Update:
- fixar release, commit e manifesto no início;
- exigir manutenção ativa e comprovada antes da primeira alteração;
- aplicar migrations compatíveis;
- publicar exatamente o commit autorizado;
- validar banco, app, health e versão;
- retirar manutenção somente após reconciliação completa;
- em falha ambígua, preservar manutenção e bloquear tráfego incompatível.

Compensações:
- recurso criado sem vínculo: reconciliar/adotar antes de recriar;
- deploy iniciado sem resposta: consultar pelo ID/idempotency key;
- código publicado e banco falho: manutenção + diagnóstico, sem rollback destrutivo automático;
- banco aplicado e deploy falho: retry do deploy fixado, sem reaplicar migration;
- exclusão automática somente para recursos comprovadamente criados pela tentativa e ainda vazios.

Aceite: matriz de falhas por etapa demonstra recuperação segura e estado final consistente.

## Fase 5 — Relatórios manuais, segurança e contratos

1. Separar contrato manual autenticado por `run_token_hash` do contrato automático com lease/fencing.
2. Relatório manual ganha RPC próprio, token expirável, sequência monotônica e proteção contra replay.
3. Callbacks externos usam assinatura, timestamp, nonce e comparação segura; rejeitar payload antigo ou repetido.
4. Preservar autorização de Super Admin para ações de instalação e RLS existente para leitura.
5. Auditar todas as funções privilegiadas, grants e políticas; nenhuma elevação no navegador.
6. Rotacionar tokens de execução ao finalizar/cancelar e redigir segredos em todos os erros.
7. Health check verifica executor, fila, banco, manifesto, deploy e versão — não apenas HTTP 200 da aplicação.

Aceite: relatórios intermediários manuais funcionam sem lease automática; replay, token expirado e assinatura inválida são rejeitados.

## Fase 6 — Interface e observabilidade

1. Lista e detalhe usam o mesmo estado canônico e atualização enquanto houver operação ativa/retry.
2. Exibir: etapa real, progresso acumulado, última atividade, lease, próxima tentativa, tentativas usadas, release/commit, bloqueio e erro original sanitizado.
3. Estados distintos: aguardando, executando, aguardando provedor, nova tentativa, interrompida, bloqueada, revisão manual, concluída e cancelada.
4. Nunca mostrar `running` quando lease expirou e não existe comando pendente.
5. Ações de retomar/reiniciar/cancelar obedecem idempotência e dupla confirmação existente.
6. Logs estruturados com correlation ID por operação/tentativa/etapa/provedor.
7. Métricas e alertas: profundidade/idade da fila, tempo até claim, heartbeat, leases vencidas, retries, falhas por classe, duração por etapa, 5xx/504 e divergência de versão.
8. Painel operacional com SLOs e runbook vinculado; consultas de histórico paginadas/indexadas para não pressionar o banco.

Aceite: falhas injetadas aparecem na tela e alerta em até cinco minutos, com ação clara e sem exposição de segredo.

## Fase 7 — Performance e capacidade

1. Remover esperas de um minuto entre fatias; encadear imediatamente enquanto houver orçamento.
2. Controlar concorrência global, por instalação e por provedor.
3. Medir cada query/RPC do instalador e criar índices somente com evidência.
4. Corrigir consultas operacionais que varrem histórico, incluindo acesso recente ao histórico do cron.
5. Isolar instalação dos demais workers para evitar falha em cascata.
6. Ajustar tamanho de lotes por tempo e custo medidos, não por quantidade fixa.
7. Definir circuit breaker para 429/5xx/504 e modo degradado que evita tempestade de retries.

Aceite: teste de carga com operações concorrentes cumpre SLO sem aumentar 504, conexões, WAL ou latência da aplicação.

## Fase 8 — Migração, rollout e recuperação da Taveira

1. Entregar em releases MASTER-first pequenas e reversíveis, sugeridas:
   - 1.3.84: invariantes, tentativas, outbox, checkpoint isolado e telemetria;
   - 1.3.85: executor externo durável, retries e reconciliação;
   - 1.3.86: ledger/hash/ordem de migrations e baseline consolidado;
   - 1.3.87: sagas de provision/update, manutenção fail-closed e UI;
   - 1.3.88: remoção do legado e hardening final.
2. Cada release segue obrigatoriamente: migration no MASTER → `build_delta.py` → SHA/versão sincronizados → `verify-installation.sql` → `bun run master:check` → guardiões.
3. Fazer shadow mode: novo reconciliador observa sem executar; comparar decisões com o legado.
4. Canary em ambiente descartável; depois uma instalação controlada; só então ampliar.
5. Drenar operações antigas, migrar checkpoints somente quando fingerprint compatível e marcar incompatíveis para revisão.
6. Desativar cron/endpoint legado após zero operações dependentes e janela estável.
7. Taveira: não reiniciar cegamente. Após rollout aprovado, reconciliar recursos, manifesto, ledger e checkpoint; abrir uma nova tentativa limpa ou retomar apenas se todos os fingerprints coincidirem.
8. Plano de rollback por release: reativar executor anterior apenas para operações no formato antigo; nunca reverter migrations de dados automaticamente.

Aceite: canary completo, soak de 72 horas sem órfãos/falhas silenciosas e autorização explícita antes de publicar ou propagar.

## Matriz mínima de testes

- concorrência: dois workers, lease perdida, fencing antigo, lote com uma falha, operação ativa única;
- lifecycle: incremento único, backoff/jitter, exaustão, cancelamento, finalização indisponível;
- outbox: crash antes/depois do commit, callback duplicado, entrega fora de ordem, item perdido, delayed retry;
- checkpoints: isolamento entre operação/kind/release/hash, leitura e gravação indisponíveis;
- migrations: replay, hash divergente, predecessora ausente, ordem inválida, DDL existente, deferred SQL e equivalência de schema;
- provedores: 401/403, 409, 429, 5xx, timeout, resposta perdida e sucesso consultável por ID;
- saga: falha em cada fronteira banco/código/deploy/manutenção/health e compensação correspondente;
- manual: progresso sem lease automática, token expirado, replay e relatório fora de sequência;
- segurança: RBAC, RLS, grants, assinatura, redaction, ausência de segredo no cliente/log/banco;
- UI: progresso monotônico, lease vencida, retry futuro, bloqueio, revisão, lista/detalhe consistentes;
- carga/caos: múltiplas instalações, indisponibilidade do executor/banco/provedor, retomada após reinício;
- MASTER-first: sync, baseline completeness, manifesto, versionamento, verify e instalação limpa.

## Definition of Done

A correção só estará concluída quando:
- todos os testes acima passarem;
- não houver `catch` silencioso em persistência, manutenção, checkpoint ou finalização;
- o executor legado estiver drenado e removido;
- 72 horas de canary não apresentarem órfãos ou falhas silenciosas;
- dashboards e alertas estiverem ativos;
- runbooks de retry, bloqueio, revisão manual, rollback e desastre estiverem testados;
- pacote MASTER, SHA, versão, verificador e guardiões estiverem sincronizados;
- publicação e propagação tiverem autorização explícita do usuário.
