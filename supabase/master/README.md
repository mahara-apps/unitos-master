# Bootstrap do Control-plane MASTER

Este diretório é exclusivo do banco MASTER e nunca integra o pacote Client.

- `001_control_plane_convergence_v1_4_3.sql`: convergência idempotente recuperada da definição histórica canônica. Deve entrar depois da migration `20260913205310_998a5893-b6be-4068-806a-520361185290.sql` e antes de `20260913230055_f50b7d0b-e5e5-4cc8-9ad0-ddcfd8104005.sql`.
- `bootstrap-control-plane.sql`: artefato gerado com as 28 migrations Control-plane, na ordem física, e a convergência no ponto obrigatório.
- `bootstrap-control-plane.json`: manifesto selado com versão e SHA-256 do bootstrap e da convergência.
- `tools/build_master_bootstrap.py`: gerador determinístico do artefato.
- `tools/promote_master_control_plane.sh`: promoção transacional explícita para Master existente ou Master limpo, seguida do verificador read-only.
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

A recuperação histórica é um terceiro modo, bloqueado por `UNITOS_MASTER_RECOVERY=RECOVER_MISSING_1_4_10_ONLY`, `MASTER_PROJECT_REF` idêntico ao manifesto e preflight integralmente `PASS`. O preflight valida a definição completa, corpo, assinatura sem overloads, propriedades, owner, ACL expandida e dependências da 1.4.11; `PUBLIC` é identificado exclusivamente por `grantee = 0`, sem resolução como role nomeada. O modo monta uma área temporária contendo exclusivamente `20260919143000_recover_missing_legacy_reconciliation.sql`, exige que o `dry-run` da Supabase CLI selecione somente esse arquivo, sela todo o staging por SHA-256 e confere o selo novamente imediatamente antes da execução. Qualquer alteração intermediária, seleção da 1.4.10, reaplicação da 1.4.11 ou outra migration aborta o fluxo. A Supabase CLI executa e registra a nova identidade; o SQL não escreve no ledger, nunca repara ou inventa a entrada histórica `20260917184500` e não contém SQL da 1.4.11.
