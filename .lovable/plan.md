## Causa raiz

O trigger `handle_new_user` (que roda em todo `INSERT` em `auth.users`) tenta inserir o perfil com `role = 'member'` como fallback:

```sql
COALESCE(NEW.raw_user_meta_data->>'role', 'member')
```

Mas a tabela `public.user_profiles` tem um CHECK constraint que só aceita `'admin' | 'manager' | 'editor' | 'sdr_operator'`. Resultado: **toda criação de conta falha** com violação de constraint, e o Supabase Auth devolve "Database error saving new user" — inclusive quando você cria o usuário direto pelo painel do Supabase, pelo signup público, pelo convite de equipe e pelo provisionamento admin.

Também há risco secundário: se algum convite injetar `role` no `raw_user_meta_data` com um valor fora da lista, o mesmo erro acontece.

## Correção

Migração única em `supabase--migration` que recria `public.handle_new_user()`:

1. Fallback default passa de `'member'` para `'editor'` (valor válido no CHECK e coerente com o default da coluna).
2. Sanitiza o `role` vindo de `raw_user_meta_data`: se não estiver na allow-list (`admin/manager/editor/sdr_operator`), cai para `'editor'` em vez de propagar valor inválido.
3. Envolve o `INSERT` em `EXCEPTION WHEN OTHERS` que loga via `RAISE WARNING` e devolve `NEW`, para que uma falha futura de perfil **nunca mais** derrube a criação do usuário no `auth.users` (o perfil pode ser reconciliado depois, mas o cadastro não deve ser bloqueado por isso).
4. Mantém `ON CONFLICT (id) DO NOTHING` e `SECURITY DEFINER` como já estão.

Não altero schema, RLS, nem código de frontend — o bug é 100% no trigger.

## Validação após aplicar

- Criar usuário via `/auth` (signup público) → deve logar e criar linha em `user_profiles` com `role='editor'`.
- Criar usuário via Supabase Dashboard → Users → Add user → sem erro.
- Aceitar um `brand_invite` de novo usuário → perfil criado, `accept_brand_invite` roda normal.
- Provisionamento admin (fluxo de senha aleatória + `MandatoryPasswordReset`) → perfil criado com `requires_password_change=true` preservado pelo fluxo existente (não é setado pelo trigger).
- `SELECT id, role FROM public.user_profiles ORDER BY created_at DESC LIMIT 5;` para confirmar.
