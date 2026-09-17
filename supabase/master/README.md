# Bootstrap do Control-plane MASTER

Este diretório é exclusivo do banco MASTER e nunca integra o pacote Client.

- `001_control_plane_convergence_v1_4_3.sql`: convergência idempotente recuperada da definição histórica canônica. Deve entrar depois da migration `20260913205310_998a5893-b6be-4068-806a-520361185290.sql` e antes de `20260913230055_f50b7d0b-e5e5-4cc8-9ad0-ddcfd8104005.sql`.
- `bootstrap-control-plane.sql`: artefato gerado com as 28 migrations Control-plane, na ordem física, e a convergência no ponto obrigatório.
- `tools/build_master_bootstrap.py`: gerador determinístico do artefato.
- `../install/verify-installation-master.sql`: auditoria read-only do estado final Master.

`installation_operation_effects` e `installation_migration_ledger` permanecem deliberadamente ausentes: não possuem consumidor atual e dependem de decisão arquitetural futura.

Regeneração local:

```bash
python3 supabase/master/tools/build_master_bootstrap.py
```
