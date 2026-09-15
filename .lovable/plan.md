# Solução definitiva — workflow de instalações v1.4.0

## Diagnóstico confirmado até aqui
- O código local ainda anuncia `1.3.96`, embora o MASTER informado seja `1.4.0`; a implementação sincronizará a fonte versionada e o pacote sem tocar instalações legadas.
- NEW e UPDATE compartilham o delta incremental, mas NEW ainda executa os arquivos fixos do baseline por um caminho próprio de statements/checkpoints.
- `start_durable_installation_operation` é chamada para abrir NEW/UPDATE, porém sua criação precisa ser garantida explicitamente na cadeia versionada e validada no pacote.
- NEW possui pontos que podem encerrar como falha em vez de `yield/resume`, efeitos externos sem comprovante persistido suficiente e esperas repetidas de Git/Vercel.
- A conclusão já exige todas as etapas `done`, mas alguns erros de persistência/finalização são descartados com `.catch(() => undefined)`, podendo esconder divergência entre efeito externo e estado no MASTER.

## Implementação P0
1. Consolidar um contrato único de etapas duráveis para NEW/UPDATE: preflight, release fixada, código/template, vínculo de deploy, baseline/delta, secrets/env, deploy, health, cron/brain, validação e promoção.
2. Persistir antes/depois de cada efeito externo uma chave idempotente e seu comprovante; retomadas consultam o comprovante e não repetem Git, Supabase ou Vercel quando o efeito já foi confirmado.
3. Fazer NEW usar o mesmo executor incremental de migrations de UPDATE para todo SQL versionado; arquivos estruturais fixos continuam ordenados, mas passam pelo mesmo contrato de ledger/checkpoint/evidência.
4. Tornar `start_durable_installation_operation` uma migration explícita, `SECURITY DEFINER`, com grants mínimos, trava de operação ativa, estado inicial e metadados do pacote na mesma transação.
5. Fixar o pacote v1.4.0 na abertura de NEW, como já ocorre em UPDATE; validar versão, SHA global, quantidade, manifesto, ordem e fingerprints antes de qualquer alteração no destino.
6. Trocar falhas transitórias por `retry/defer` limitado e persistido; manter falhas definitivas como `failed/blocked` na etapa exata. Nenhum loop poderá exceder orçamento ou quantidade definidos.
7. Tornar a finalização obrigatória e observável: remover descartes silenciosos, só promover versão após migrations, validação, deployment READY e health check confirmados.
8. Preservar UPDATE e registros existentes: sem backfill presumido, sem fallback paralelo e sem reconcile automático de instalações legadas.

## Testes e verificação
- Clean NEW completo v1.4.0 na ordem exigida.
- Falha em cada fronteira externa, retry limitado e etapa persistida correta.
- Resume após falha parcial sem repetir efeitos comprovados.
- Replay da mesma release como no-op verificável.
- Manifesto/SHA/ordem divergentes falham antes de escrever.
- DROP FUNCTION ausente segue somente a pós-condição específica.
- Deploy verde sem validação/health nunca conclui nem promove versão.
- Concorrência, lease/fencing e ausência de `start_durable_installation_operation` cobertos por guardiões.
- Regenerar delta/manifesto, sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION` em `1.4.0`, ampliar `verify-installation.sql`, executar testes focados, suíte disponível, typecheck, build e `master:check`, e revisar o diff final.

## Limites
- Não acessar, reconciliar ou alterar Taveira nem instalações legadas.
- Não alterar produto fora do módulo de instalações.
- A migration do workflow será aplicada somente ao MASTER, pelo fluxo oficial de migration, após a inspeção confirmar que não quebra o contrato atual.
- Se a definição atual do banco exigir assinatura incompatível com consumidores existentes, a execução para antes da alteração e o bloqueio será reportado.
