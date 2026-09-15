# Auditoria read-only do workflow de instalações — etapa 2

## Escopo

- Consolidar o inventário cronológico das migrations que criam ou alteram `installations`, `installation_operations`, `installation_operation_migrations` e as funções críticas solicitadas.
- Comparar cada objeto com as 112 posições do pacote 1.3.96, o snapshot inicial e o gerador do delta.
- Contrastar os caminhos de aplicação do `bootstrap.sh` e da automação do MASTER, incluindo saneamento, wrapper, ledger e checkpoints.
- Classificar cada objeto e caminho como PASS/FAIL, sem alterar código, migrations, banco ou dados.

## Evidências já confirmadas

- `installations` e `installation_operations` são criadas na posição 20 do delta; lease/heartbeat/checkpoint/finalização evoluem principalmente nas posições 81, 93–100 e 104.
- `seal_installation_operation_baseline` só entra nas posições 105–106.
- `installation_operation_migrations` só nasce na posição 107; `reconcile_installation_operation_migrations` só entra na posição 108; ajustes posteriores ocupam 109–112.
- `start_durable_installation_operation` é chamado pelo código e existe no banco MASTER, mas não possui definição em nenhuma migration nem no `007_delta_migrations.sql` versionado.
- `bootstrap.sh` aplica o `007_delta_migrations.sql` inteiro diretamente com `psql -f`, sem o wrapper por statement, sem ledger incremental e sem checkpoint canônico.
- A atualização conduzida pelo MASTER divide o delta por migration, fixa versão/SHA, mantém ledger no destino e usa reconciliação/checkpoint canônicos no MASTER.

## Entrega

1. Tabela cronológica com migration, posição, objeto e dependências.
2. PASS/FAIL individual para tabelas, funções e pacote 1.3.96.
3. Mapa dos caminhos que aplicam o delta, destacando o caminho direto sem wrapper/checkpoint.
4. Causa provável do estado parcial observado na Taveira, limitada às evidências de arquivo e banco lidas.
5. Lacunas que impedem garantia total, especialmente a origem não versionada de `start_durable_installation_operation`.
