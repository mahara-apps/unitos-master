# UPDATE determinístico e recuperável — MASTER

## Objetivo
Unificar a verdade de versão e tornar UPDATE idempotente, retomável e fail-closed, sem alterar Apex nem qualquer ambiente remoto.

## Implementação
1. Criar um contrato canônico de release por operação: release/commit/pacote desejados, release/commit comprovadamente publicados, versão aplicada no banco Client e estado explícito de reconciliação.
2. Impedir promoção de versão fora da finalização transacional: deployment iniciado ou operação criada nunca atualizam a versão efetiva; sucesso exige migrations/ledger/checkpoints íntegros, build confirmado e validação final aprovada.
3. Endurecer o executor para uma operação ativa por instalação, lease/heartbeat/fencing em todas as mutações, retomada do mesmo pacote selado e repetição como no-op quando todas as evidências já existem.
4. Classificar operações interrompidas de forma determinística: pending sem lease é reivindicável; running com lease válido é intocável; running expirado é retomável após órfã reconciliada; failed é terminal; manual_review permanece bloqueada; installation updating sem operação executável vira inconsistência explícita, nunca sucesso.
5. Reconciliar manifesto, ledger Client e checkpoints Master sem inferir execução: confirmação só com identidade completa e evidência Client; divergência ou lacuna bloqueia para revisão manual.
6. Adicionar a migration MASTER/control-plane necessária, grants e RLS mínimos, atualizar verificador Master e regenerar os artefatos MASTER-first. O pacote Client permanece isolado.

## Testes
- UPDATE completo; falha antes/durante migration; timeout e retomada; dois executores; divergência produção × Control-plane; ledger incompleto/inconsistente; pending sem lease; repetição já aplicada; freeze fail-closed.
- Executar testes focados, suíte global, `master:check`, typecheck, lint, build e PostgreSQL isolado quando houver alteração SQL.

## Limites
Nenhum acesso remoto de escrita, recovery/UPDATE/NEW/retry/P0, alteração da operação Apex, ativação do cron, migration remota, publicação ou deploy.

## Entrega
Relatório curto com problema estrutural, arquivos, solução, resultados, bloqueios reais e validação mínima em instalação descartável antes do Apex.
