# Bootstrap do Control-plane MASTER

Este diretório é exclusivo do banco MASTER e nunca integra o pacote Client.

- `001_control_plane_convergence_v1_4_3.sql`: convergência idempotente recuperada da definição histórica canônica. Deve entrar depois da migration `20260913205310_998a5893-b6be-4068-806a-520361185290.sql` e antes de `20260913230055_f50b7d0b-e5e5-4cc8-9ad0-ddcfd8104005.sql`.
- `bootstrap-control-plane.sql`: artefato gerado com as 30 migrations Control-plane, convergência, proteção global e finalização determinística ao final.
- `003_control_plane_deterministic_update.sql`: fecha operação, versão aplicada e reconciliação na mesma transação fenced; bloqueia evidência parcial.
- `bootstrap-control-plane.json`: manifesto selado com versão e SHA-256 do bootstrap e da convergência.
- `tools/build_master_bootstrap.py`: gerador determinístico do artefato.
- `tools/promote_master_control_plane.sh`: promoção transacional explícita para Master existente ou Master limpo, seguida do verificador read-only.
- `002_control_plane_global_freeze.sql`: proteção MASTER-only que serializa e bloqueia todas as mutações do Installation Manager.
- `tools/control_plane_freeze.sh`: ferramenta separada para consultar, ativar e desativar o congelamento com identidade, motivo, responsável e geração esperada.
- `recovery/20260919143000_recover_missing_legacy_reconciliation.sql`: recuperação excepcional e transacional da lacuna 1.4.10 quando 1.4.11 já está aplicada; fica fora do pacote Client e do bootstrap limpo.
- `recovery-control-plane-preflight.sql` e `recovery-control-plane.json`: preflight read-only e manifesto selado da recuperação.
- `../install/verify-installation-master.sql`: auditoria read-only do estado final Master.

`installation_operation_effects` e `installation_migration_ledger` permanecem deliberadamente ausentes: não possuem consumidor atual e dependem de decisão arquitetural futura.

Regeneração local:

```bash
python3 supabase/master/tools/build_master_bootstrap.py
python3 supabase/master/tools/build_master_bootstrap.py --check
python3 supabase/master/tools/build_master_recovery.py --check
```

O `master:check` usa `--check` e bloqueia a liberação se o SQL ou o manifesto estiverem ausentes/divergentes. A promoção exige `MASTER_DATABASE_URL` e a confirmação explícita `UNITOS_MASTER_PROMOTION=I_UNDERSTAND_MASTER_ONLY`; ela nunca é executada pelo fluxo Client.

Para um Master existente, `master:promote:convergence` aplica somente a convergência idempotente. Para um Master limpo, `master:promote:bootstrap` aplica o bootstrap Control-plane completo. Ambos usam uma única transação e só concluem se `verify-installation-master.sql` não retornar `FAIL`.

A recuperação histórica é um terceiro modo, bloqueado por `UNITOS_MASTER_RECOVERY=RECOVER_MISSING_1_4_10_ONLY`, `MASTER_PROJECT_REF` idêntico ao manifesto e preflight integralmente `PASS`. O preflight valida a definição completa, corpo, assinatura sem overloads, propriedades, owner, ACL expandida e dependências da 1.4.11; `PUBLIC` é identificado exclusivamente por `grantee = 0`, sem resolução como role nomeada.

Os argumentos da 1.4.11 são validados separadamente pelo catálogo: `proargnames` confirma nomes e ordem, enquanto `proargtypes` e `pronargs` confirmam tipos, ordem e quantidade. O resultado não depende da forma textual, nomeada ou sem nomes, retornada por `pg_get_function_identity_arguments`. O ensaio obrigatório sem rede usa `bash supabase/master/tools/test_master_recovery_local.sh`; ele cria e destrói um cluster PostgreSQL temporário em `/tmp`, testa divergências de assinatura/overload e comprova aplicação e rollback da recovery.

O executor usa exclusivamente a Supabase CLI local fixada em `2.117.0`. O contrato aceito do `db push --dry-run` contém exatamente um cabeçalho `DRY RUN: migrations will *not* be pushed to the database.`, uma linha por seleção no formato `Would push migration <arquivo>.sql...` e um rodapé `Finished supabase db push.`. Qualquer versão ou formato divergente bloqueia a execução.

Antes e depois da cópia, o executor compara o SHA-256 da recovery com o manifesto; cada migration histórica copiada é comparada individualmente com sua única origem local. O staging rejeita versões duplicadas, nomes inesperados, arquivos extras e divergência entre manifesto, origem e cópia. O snapshot ordenado do ledger é refeito após o dry-run e imediatamente antes da execução; qualquer alteração concorrente aborta. Todo o staging também é selado por SHA-256 e revalidado imediatamente antes do push. A Supabase CLI executa e registra somente `20260919143000`; o SQL não escreve no ledger, nunca repara ou inventa `20260917184500` e não contém SQL da 1.4.11.

Janelas residuais inevitáveis: o preflight e o dry-run usam conexões independentes; uma alteração de banco pode ocorrer entre o último snapshot do ledger e a transação interna da CLI. Também há uma janela mínima entre a última leitura dos hashes e a abertura dos arquivos pela CLI. Por isso, o ensaio exige ambiente Supabase isolado, sem outros escritores, snapshot descartável e versão local fixada da CLI.

## Congelamento operacional

A instalação do mecanismo, sua ativação, a recovery e o UPDATE são quatro autorizações independentes. `master:install:freeze` instala somente a proteção no Control-plane; `master:freeze:status` é leitura; `master:freeze:on` e `master:freeze:off` exigem confirmação, motivo e responsável. Ativar falha se houver operação ou tentativa ativa e usa a mesma advisory lock das triggers, impedindo que uma nova mutação entre entre a verificação de quiescência e o commit. Estado ausente, duplicado ou ilegível bloqueia as mutações.

Enquanto ativo, triggers `BEFORE ... FOR EACH STATEMENT` bloqueiam INSERT, UPDATE e DELETE em instalações, credenciais, operações, tentativas, etapas, outbox, checkpoints de migration e evidências. Rotas públicas, cron, worker e funções da interface também consultam o estado para falhar cedo; as triggers continuam sendo a autoridade contra chamadas diretas com `service_role`. A recovery 1.4.14 exige o freeze ativo e adquire a mesma lock. Descongelar não cria nem autoriza UPDATE.
