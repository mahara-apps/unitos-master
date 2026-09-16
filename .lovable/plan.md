# Convergência Master e separação definitiva do pacote Client

## Implementação

1. Criar um artefato SQL versionado de convergência Master, fora de `supabase/migrations`, contendo somente:
   - as sete colunas ausentes de `installation_operations`;
   - `installation_operation_steps`;
   - `installation_operation_outbox` mantida como quarentena legada;
   - `installation_operations_reconcile_idx`;
   - RLS, policies, grants/revokes, índices e triggers comprovados.
   `installation_operation_effects` e `installation_migration_ledger` permanecerão explicitamente fora por não terem consumidor atual.

2. Criar o verificador read-only Master separado e completar sintaticamente o verificador Client, mantendo cada domínio isolado.

3. Remover do fluxo Client qualquer preparação Control-plane e atualizar os contratos para que NEW e UPDATE usem somente o pacote Client selado.

4. Preservar o mapa canônico das 115 migrations existentes: 82 Client, 28 Control-plane, 3 Split e 2 Excluded. O novo artefato Master não fará parte desse mapa nem do pacote Client.

5. Adicionar guardiões estruturais para:
   - validar o SQL do bootstrap Master e sua ordem anterior aos consumidores;
   - provar ausência de objetos Master no pacote/verificador Client;
   - validar os três splits, mapa e pacote de 85 blocos;
   - provar que `applyDatabaseDelta` não envia SQL Master-only;
   - manter NEW e retry no mesmo pacote Client.

6. Regenerar deterministicamente pacote e manifesto. Atualizar SHA/versão apenas se os bytes do pacote Client mudarem; caso contrário, manter 1.4.3 e seu SHA canônico.

## Validação

Executar testes do gerador, verificadores, separação Client/Master, checkpoints, snapshot, NEW/retry, suíte de instalação segura, suíte global local, `master:check`, typecheck, lint e build. Não executar SQL remoto, NEW real, retry real ou publicação.

## Restrição técnica adotada

`supabase/migrations` é aplicado automaticamente ao Master e aumentaria o universo físico auditado. Por isso a convergência ficará em um bootstrap Master versionado separado, validado e promovível explicitamente, sem entrar no pacote Client.
