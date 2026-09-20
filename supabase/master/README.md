# Bootstrap do Control-plane MASTER

Este diretório é exclusivo do banco MASTER e nunca integra o pacote Client.

- `001_control_plane_convergence_v1_4_3.sql`: convergência idempotente recuperada da definição histórica canônica. Deve entrar depois da migration `20260913205310_998a5893-b6be-4068-806a-520361185290.sql` e antes de `20260913230055_f50b7d0b-e5e5-4cc8-9ad0-ddcfd8104005.sql`.
- `bootstrap-control-plane.sql`: artefato gerado com as 30 migrations Control-plane, convergência, proteção global e finalização determinística ao final.
- `003_control_plane_deterministic_update.sql`: fecha operação, versão aplicada e reconciliação na mesma transação fenced; bloqueia evidência parcial, posições com lacunas/duplicidades e fingerprints inválidos.
- `control-plane-contract.json`: inventário selado dos objetos, assinaturas, triggers e hashes exigidos para freeze e executor.
- `install-deterministic-update.sql`: transação exclusiva de instalação do executor; reassume a advisory lock, exige freeze ativo e quiescência antes de aplicar e verificar a RPC.
- `deterministic-update-install-preflight.sql`: preflight read-only obrigatório dessa instalação independente.

## Política de retomada de UPDATE

- `pending` automatizada sem lease e `running`/`retryable` com lease expirado: podem ser reivindicadas pelo executor oficial, que sempre incrementa o fencing token.
- `running` com lease vigente: outro executor deve aguardar; qualquer escrita do worker anterior é rejeitada após novo claim.
- `failed`: é terminal e preserva evidências; não é transformada silenciosamente em sucesso nem retomada sem uma nova decisão explícita.
- `blocked` ou `manual_review`: exigem intervenção explícita; nenhuma migration é inferida ou reaplicada.
- instalação `updating` sem operação automatizada executável: é marcada como inconsistente para revisão, nunca declarada atualizada.

Uma operação de UPDATE só conclui quando release, commit e SHA-256 do pacote selado coincidem com a publicação, todas as migrations possuem confirmação canônica, todas as etapas terminaram e a validação final passou. A mesma RPC fenced atualiza operação, instalação, versão aplicada e estado de reconciliação. Falha de finalização é propagada e nunca retorna `PASS`.
- `bootstrap-control-plane.json`: manifesto selado com versão e SHA-256 do bootstrap e da convergência.
- `tools/build_master_bootstrap.py`: gerador determinístico do artefato.
- `tools/promote_master_control_plane.sh`: promoção transacional explícita para Master existente ou Master limpo, seguida do verificador read-only.
- `002_control_plane_global_freeze.sql`: proteção MASTER-only que serializa e bloqueia todas as mutações do Installation Manager.
- `tools/control_plane_freeze.sh`: ferramenta separada para consultar, ativar e desativar o congelamento com identidade, decisão global de risco auditada, motivo, responsável e geração esperada.
- `recovery/20260919143000_recover_missing_legacy_reconciliation.sql`: recuperação excepcional e transacional da lacuna 1.4.10 quando 1.4.11 já está aplicada; fica fora do pacote Client e do bootstrap limpo.
- `recovery-control-plane-preflight.sql` e `recovery-control-plane.json`: preflight read-only e manifesto selado da recuperação.
- `../install/verify-installation-master.sql`: auditoria read-only do estado final Master.

`installation_operation_migrations` é o ledger operacional canônico por operação; `installation_migration_reconciliation_evidence` guarda evidência legada verificável. As estruturas históricas sem consumidor `installation_operation_effects` e `installation_migration_ledger` permanecem deliberadamente ausentes e não são usadas para inferir aplicação.

Regeneração local:

```bash
python3 supabase/master/tools/build_master_bootstrap.py
python3 supabase/master/tools/build_master_bootstrap.py --check
python3 supabase/master/tools/build_master_recovery.py --check
python3 supabase/master/tools/build_control_plane_contract.py --check
```

O `master:check` usa `--check` e bloqueia a liberação se o SQL ou o manifesto estiverem ausentes/divergentes. A promoção exige `MASTER_DATABASE_URL` e a confirmação explícita `UNITOS_MASTER_PROMOTION=I_UNDERSTAND_MASTER_ONLY`; ela nunca é executada pelo fluxo Client.

## Protocolo de backup

Toda escrita no Control-plane compartilhado exige, além da autorização própria da operação, uma decisão global de risco auditável. O caminho preferencial comprova backup restaurável com `UNITOS_MASTER_BACKUP_CONFIRMATION=BACKUP_RESTORABLE_VERIFIED`, `UNITOS_MASTER_BACKUP_EVIDENCE` e `UNITOS_MASTER_BACKUP_OPERATOR`.

Quando não houver backup restaurável, o gate aceita somente a decisão global literal `UNITOS_MASTER_NO_BACKUP_CONFIRMATION=ACCEPT_EXISTING_CONTROL_PLANE_WITHOUT_RESTORABLE_BACKUP`, vinculada por `UNITOS_MASTER_NO_BACKUP_PROJECT_REF=tkjbhttylouamqxnbfgv`, com operador e justificativa específica em `UNITOS_MASTER_NO_BACKUP_OPERATOR` e `UNITOS_MASTER_NO_BACKUP_RISK_ACCEPTED`. Não existe caminho por instalação descartável, curingas ou escopo de instalação.

Ambos os caminhos exigem `UNITOS_MASTER_BACKUP_AUDIT_FILE` persistente. O gate registra uma linha JSON com data UTC, decisão, escopo, project ref e operador; registra evidência no caminho com backup e risco aceito no caminho sem backup. O resumo no terminal não imprime a justificativa. O gate nunca cria backup nem executa escrita automaticamente. A decisão de risco e a autorização de recovery, migration, freeze ou executor continuam separadas.

Para um Master existente, `master:promote:convergence` aplica somente a convergência idempotente. Para um Master limpo, `master:promote:bootstrap` aplica o bootstrap Control-plane completo. Ambos usam uma única transação e só concluem se `verify-installation-master.sql` não retornar `FAIL`.

`master:install:deterministic-update` instala somente a finalização 1.4.18. Exige decisão global de risco aceita pelo gate, identidade exata do Master, `UNITOS_MASTER_DETERMINISTIC_UPDATE_INSTALL=INSTALL_DETERMINISTIC_UPDATE_ONLY`, preflight 5/5 PASS, freeze previamente instalado e ativo e nenhuma operação/tentativa ativa. O SQL reassume a mesma advisory lock e repete quiescência dentro da transação, impedindo promoção parcial ou concorrente. Esse comando não ativa freeze, não trata a operação Apex e não executa recovery ou UPDATE.

Os diagnósticos `master:diagnose:release -- --evidence <arquivo.json>` e `diagnose_control_plane_contract.py --report <export.json>` são estritamente offline: valores ausentes ou divergentes resultam em `BLOCK`; nenhuma versão é inferida e nenhum deploy é iniciado.

A recuperação histórica é um terceiro modo, bloqueado por `UNITOS_MASTER_RECOVERY=RECOVER_MISSING_1_4_10_ONLY`, `MASTER_PROJECT_REF` idêntico ao manifesto e preflight integralmente `PASS`. O preflight valida a definição completa, corpo, assinatura sem overloads, propriedades, owner, ACL expandida e dependências da 1.4.11; `PUBLIC` é identificado exclusivamente por `grantee = 0`, sem resolução como role nomeada.

Os argumentos da 1.4.11 são validados separadamente pelo catálogo: `proargnames` confirma nomes e ordem, enquanto `proargtypes` e `pronargs` confirmam tipos, ordem e quantidade. O resultado não depende da forma textual, nomeada ou sem nomes, retornada por `pg_get_function_identity_arguments`. O ensaio obrigatório sem rede usa `bash supabase/master/tools/test_master_recovery_local.sh`; ele cria e destrói um cluster PostgreSQL temporário em `/tmp`, testa divergências de assinatura/overload e comprova aplicação e rollback da recovery.

O executor usa exclusivamente a Supabase CLI local fixada em `2.117.0`. O contrato aceito do `db push --dry-run` contém exatamente um cabeçalho `DRY RUN: migrations will *not* be pushed to the database.`, uma linha por seleção no formato `Would push migration <arquivo>.sql...` e um rodapé `Finished supabase db push.`. Qualquer versão ou formato divergente bloqueia a execução.

Antes e depois da cópia, o executor compara o SHA-256 da recovery com o manifesto; cada migration histórica copiada é comparada individualmente com sua única origem local. O staging rejeita versões duplicadas, nomes inesperados, arquivos extras e divergência entre manifesto, origem e cópia. O snapshot ordenado do ledger é refeito após o dry-run e imediatamente antes da execução; qualquer alteração concorrente aborta. Todo o staging também é selado por SHA-256 e revalidado imediatamente antes do push. A Supabase CLI executa e registra somente `20260919143000`; o SQL não escreve no ledger, nunca repara ou inventa `20260917184500` e não contém SQL da 1.4.11.

Janelas residuais inevitáveis: o preflight e o dry-run usam conexões independentes; uma alteração de banco pode ocorrer entre o último snapshot do ledger e a transação interna da CLI. Também há uma janela mínima entre a última leitura dos hashes e a abertura dos arquivos pela CLI. Por isso, o ensaio exige ambiente Supabase isolado, sem outros escritores, snapshot descartável e versão local fixada da CLI.

## Congelamento operacional

A instalação do mecanismo, sua ativação, a instalação do executor determinístico, a recovery e o UPDATE são autorizações independentes. `master:install:freeze` instala somente a proteção no Control-plane; `master:freeze:status` é leitura e não passa pelo gate; `master:freeze:on` e `master:freeze:off` exigem confirmação própria, motivo, responsável e decisão global de risco aceita. O gate ocorre antes da primeira consulta preparatória ao banco e registra a decisão não secreta em JSONL. Ativar falha se houver operação ou tentativa ativa e usa a mesma advisory lock das triggers, impedindo que uma nova mutação entre entre a verificação de quiescência e o commit. Estado ausente, duplicado ou ilegível bloqueia as mutações.

Enquanto ativo, triggers `BEFORE ... FOR EACH STATEMENT` bloqueiam INSERT, UPDATE e DELETE em instalações, credenciais, operações, tentativas, etapas, outbox, checkpoints de migration e evidências. Rotas públicas, cron, worker e funções da interface também consultam o estado para falhar cedo; as triggers continuam sendo a autoridade contra chamadas diretas com `service_role`. A recovery 1.4.14 exige o freeze ativo e adquire a mesma lock. Descongelar não cria nem autoriza UPDATE.
