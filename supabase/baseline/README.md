# supabase/baseline/ — área de staging (NÃO aplicada)

Estes arquivos **não estão** em `supabase/migrations/` de propósito.

Motivo: `supabase/migrations/` é gerenciado pelo pipeline de migrations do
projeto — qualquer arquivo colocado lá entra na fila de aplicação no banco de
**produção**. Como esta etapa exige explicitamente *nenhuma alteração em
produção*, os SQLs ficam aqui até aprovação.

## Arquivos

| Arquivo | Papel | Destino final |
|---|---|---|
| `20260101000000_baseline_pre_versioning.sql` | Cria `update_updated_at_column()` e `user_profiles` (objetos pré-versionamento). Timestamp **anterior** à 1ª migration histórica (`20260707030537`). | `supabase/migrations/` |
| `20260821090000_fix_user_profiles_role_and_signup.sql` | Forward-only: DEFAULT `role='user'`, CHECK, `handle_new_user()`, privilégios mínimos. | `supabase/migrations/` |
| `20260821090100_storage_buckets_baseline.sql` | Forward-only: cria os 4 buckets de Storage nunca versionados. | `supabase/migrations/` |

## Como promover (somente após aprovação)

**Validação em Supabase descartável** (clone separado do repo, nunca no
diretório ligado à produção):

```bash
git clone <repo> unitos-rebuild-test && cd unitos-rebuild-test
cp supabase/baseline/*.sql supabase/migrations/
supabase link --project-ref <ref-DESCARTAVEL>
supabase db push
```

**Produção** (etapa separada, só depois da validação verde):

- `20260101000000_...` → **nunca executar**: `supabase migration repair --status applied 20260101000000`
- `20260821090000_...` e `20260821090100_...` → aplicar pelo fluxo normal de
  migrations do projeto (ferramenta de migration), com backup/PITR confirmado.

## Comandos proibidos nesta etapa

- `supabase db push` contra produção
- `supabase migration repair` em produção
- qualquer `psql`/SQL remoto de escrita no projeto de produção
- mover estes arquivos para `supabase/migrations/` no repositório ligado à produção

Detalhes completos em `docs/DB_BASELINE_PLAN.md`.
