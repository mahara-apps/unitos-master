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
| `20260821090100_storage_buckets_baseline.sql` | Forward-only: cria os **5** buckets de Storage nunca versionados (inclui `chat-attachments`). | `supabase/migrations/` |
| `20260821090300_fix_user_profiles_privilege_escalation.sql` | Forward-only: corrige escalação de privilégio em `user_profiles` (`role` / `is_super_admin`). | `supabase/migrations/` |

## Como promover (somente após aprovação)

**Validação em Supabase descartável** (clone separado do repo, nunca no
diretório ligado à produção):

```bash
git clone <repo> unitos-rebuild-test && cd unitos-rebuild-test
cp supabase/baseline/*.sql supabase/migrations/
supabase link --project-ref <ref-DESCARTAVEL>
supabase db push
```

## Status de promoção (concluída)

- `20260821090000_...` e `20260821090300_...` → **APLICADOS EM PRODUÇÃO** via a
  ferramenta de migration (migration consolidada de promoção). Verificado:
  `user_profiles.role` DEFAULT `'user'`, CHECK ativo, `handle_new_user()` e a
  guarda `guard_super_admin_flag()` (UPDATE + INSERT) em produção.
- `20260821090100_storage_buckets_baseline.sql` → **não aplicável em produção**:
  os 5 buckets já existem e a criação de bucket é feita pela API de Storage, não
  por SQL. O arquivo permanece aqui apenas como referência de instalação limpa.
- `20260101000000_baseline_pre_versioning.sql` → permanece **fora** de
  `supabase/migrations/`. Já era idempotente e agora também é inofensivo em
  produção (a policy histórica permissiva só é recriada quando a tabela não
  possui nenhuma outra policy, cenário exclusivo de instalação limpa).

## Instalação limpa (nova instância Supabase)

```bash
cp supabase/baseline/20260101000000_*.sql supabase/migrations/
cp supabase/baseline/20260821*.sql supabase/migrations/
supabase link --project-ref <ref-NOVO>
supabase db push
```

Depois do push, criar os 5 buckets caso o SQL de buckets não tenha permissão
(`brand-assets`, `brand-documents`, `brand-media`, `avatars`,
`chat-attachments`, todos privados).


## Comandos proibidos no repositório ligado à produção

- `supabase db push` contra produção
- qualquer `psql`/SQL remoto de escrita no projeto de produção
- mover estes arquivos para `supabase/migrations/` neste repositório

Detalhes completos em `docs/DB_BASELINE_PLAN.md`.
