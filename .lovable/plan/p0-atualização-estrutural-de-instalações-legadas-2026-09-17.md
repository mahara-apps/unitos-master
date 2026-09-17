# P0 — atualização estrutural de instalações legadas

## Análise do estado atual

O fluxo NEW continuará usando o mesmo executor e pacote Client. As mudanças ficarão restritas à recuperação de UPDATE legado e ao Control-plane.

Causas confirmadas:

1. `reconcileLegacyMigrationMarker` registra as 18 evidências, mas não devolve as posições promovíveis ao executor; `reconciledLegacyPositions` não participa do progresso canônico.
2. `reconcile_installation_operation_migrations` pode retornar uma contagem menor após conflito divergente, enquanto o consumidor aceita qualquer número.
3. A RPC `read_installation_migration_reconciliation_evidence(uuid,text)` já está na migration Control-plane oficial de 1.4.10, com `SECURITY DEFINER`, `search_path=public` e acesso exclusivo de `service_role`; falta tornar essa presença um gate operacional antes do UPDATE legado.
4. A normalização existente fecha tentativas órfãs, mas não possui um contrato único para lease nula com owner preenchido, checkpoints antigos incompatíveis, `manual_review` e operações parcialmente concluídas.
5. O projeto real allowlisted `testes` está configurado no teste P0 e o token de gestão está disponível. Os ensaios destrutivos serão limitados a objetos temporários próprios e terão limpeza obrigatória.

## Arquivos e funções a alterar

### Executor e contratos

- `src/lib/installation/automation.server.ts`
  - `reconcileLegacyMigrationMarker`
  - `reconcileCanonicalMigrations`
  - `applyDatabaseDelta`
  - validação/gate da matriz de compatibilidade
- `src/lib/installation/legacy-reconciliation.ts`
  - contrato de promoção das posições integralmente comprovadas
  - diagnóstico explícito por classe de incompatibilidade
- `src/lib/installation/manager-contract.ts`
  - versão MASTER-first

### Control-plane

- Nova migration em `supabase/migrations/`
  - substituir a RPC de reconciliação em massa por implementação transacional fail-closed
  - adicionar normalização segura e idempotente de operações históricas, sem executar migrations
  - preservar grants mínimos, RLS, lease e fencing
- `supabase/master/convergence-control-plane.sql`
- `supabase/master/tools/build_master_bootstrap.py` e artefatos gerados
- `supabase/install/verify-installation-master.sql`
  - verificar assinaturas, propriedades e ACLs das RPCs necessárias ao UPDATE legado
- `supabase/baseline-snapshot/tools/migration-destinations.json`
  - classificar a nova migration como `control-plane`

### Testes

- `tests/installation-legacy-reconciliation.unit.test.ts`
- `tests/installation-delta-checkpoint.unit.test.ts`
- `tests/installation-automation.unit.test.ts`
- `tests/installation-operation-lifecycle.unit.test.ts`
- `tests/installation-master-sync.unit.test.ts`
- `tests/installation-p0-real.integration.test.ts`
  - ampliar os ensaios reais com fixtures isoladas e limpeza obrigatória
- testes adicionais focados, se a separação das matrizes exigir um arquivo próprio
- `roadmap.md`

## Implementação em etapas verificáveis

1. **Contrato de compatibilidade**
   - Classificar manifesto, pacote, ledger, evidências e checkpoints.
   - Bloquear hash, ordem, fingerprint, lacuna, posição ou total divergentes com diagnóstico auditável.

2. **Promoção segura do legado**
   - Produzir inventário somente de `canonical_state` e checkpoints externos aprovados.
   - Excluir sempre `partial_compatibility`.
   - Validar arquivo, posição, fingerprint e total de statements contra o pacote fixado.
   - Persistir por RPC protegida por lease/fencing e confirmar a contagem integral antes de continuar.

3. **Reconciliação em massa transacional**
   - Validar formato, duplicidades, todos os campos e conflitos existentes antes do `INSERT/UPDATE`.
   - Rejeitar qualquer divergência antes de gravar.
   - Retornar exatamente a quantidade do inventário e exigir igualdade no consumidor.

4. **Normalização histórica sem execução de SQL Client**
   - Encerrar tentativas órfãs e leases impossíveis preservando histórico.
   - Classificar `manual_review`, parciais e checkpoints incompatíveis sem reabrir nem avançar migrations.
   - Manter operações recuperáveis bloqueadas até nova operação oficial, sem retry duplicado.

5. **Gates Control-plane e isolamento Client**
   - Exigir a RPC de evidências e a RPC de reconciliação com assinatura, propriedades e ACLs canônicas antes do UPDATE legado.
   - Regenerar bootstrap/convergência Master.
   - Regenerar o pacote Client e confirmar exatamente 85 blocos, SHA canônico preservado e zero SQL Control-plane.

6. **Validação**
   - Testes unitários e de integração simulada para todos os estados da matriz.
   - Testes reais somente no projeto allowlisted `testes`: marcador cumulativo, promoção aprovada, parcial, lacunas/fingerprint, retorno integral, lease/fencing concorrente, attempt_count histórico, RPC ausente/assinatura divergente e regressão NEW/UPDATE.
   - Limpeza verificada após os testes reais.
   - Executar focados, `master:check`, suíte local, suíte global oficial, typecheck, lint focado e build.

## Critérios de parada

- Parar no primeiro bloqueio real de acesso ao projeto `testes`, falha de limpeza ou divergência não explicada.
- Não tocar Apex, clientes reais, NEW real, retry real, deploy ou publicação.
- Não considerar concluído sem PostgreSQL real aprovado e sem todos os gates MASTER-first.
