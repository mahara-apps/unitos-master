## Diagnóstico (verificado)

O usuário `n3@unitos.com` (id `b8df48a3-…f691a`, "Bruno Abreu") está com:

- `user_profiles.role = 'super_admin'` ✅
- `user_profiles.is_super_admin = false` ❌

Toda a plataforma decide "é super admin?" por duas RPCs `public.is_super_admin`:

- `is_super_admin()` → true só se o e-mail do JWT está numa allowlist fixa (`apitadadigital@gmail.com`, `jose@mahara.marketing`).
- `is_super_admin(_user_id)` → true só se `user_profiles.is_super_admin = true`.

Como nenhuma das duas retorna `true` para `n3@unitos.com`, o hook `useIsSuperAdmin`, o `useAccessRole`, o sidebar (grupo "Super Admin" + itens ocultos por feature flag), o gate `requireFeatureAccess` e o bypass de RLS (`is_brand_member`, `has_brand_role`) tratam-no como usuário comum. Por isso ele não vê todas as telas, não enxerga todas as marcas/clientes e não tem acesso ao painel de Super Admin — mesmo com `role='super_admin'`.

O campo `role` do `user_profiles` é ignorado pela camada de autorização; hoje ele é apenas rótulo.

## Objetivo

`n3@unitos.com` deve ter acesso irrestrito: todas as marcas, todos os clientes, todas as telas, todos os módulos (mesmo com feature flag desligada) e o painel `/super-admin/*` — comportamento idêntico ao que já foi implementado para super admins.

## Plano

### 1. Migração (dados + coerência)

- `UPDATE public.user_profiles SET is_super_admin = true WHERE id = 'b8df48a3-63f0-4d2d-8dc9-0060970f691a';` — libera o bypass imediatamente para este usuário via a RPC `is_super_admin(_user_id)` que já é usada em toda a plataforma (RLS, feature flags, sidebar, hooks).
- Reescrever `public.is_super_admin(_user_id uuid)` para também retornar `true` quando `user_profiles.role = 'super_admin'`. Assim, promover um usuário no futuro passa a funcionar por qualquer um dos dois caminhos (flag booleana ou role), eliminando esse tipo de divergência silenciosa. Continua `SECURITY DEFINER`, `STABLE`, `search_path=public`.
- Não mexer em `is_super_admin()` (allowlist por e-mail) — ela é usada em policies e continua válida como atalho.
- Não criar policies novas nem alterar grants — o bypass em RLS já está pronto (via `is_brand_member`/`has_brand_role`/`can_access_client` que chamam `is_super_admin`).

### 2. Sem mudanças de código front-end

O front já lê `useIsSuperAdmin` (→ `amISuperAdmin` server fn → `resolveIsSuperAdmin` → as duas RPCs). Assim que a migração acima rodar, na próxima renderização o usuário passa a ver:

- Sidebar completo (todos os módulos, ignorando feature flags por marca) + grupo "Super Admin" com `/super-admin/features`.
- Todas as brands no context switcher (RLS libera `brands` via `is_brand_member` que já bypassa).
- Todos os clientes de qualquer brand (RLS libera `clients` via `can_access_client` que já bypassa).
- Acesso liberado a `/brain`, `/chat`, `/content`, `/media-plans` mesmo sem `brand_features` habilitadas.

### 3. Verificação (pós-aprovação)

- `select is_super_admin, public.is_super_admin(id) from user_profiles where id='b8df48a3-63f0-4d2d-8dc9-0060970f691a';` deve retornar `true, true`.
- Pedir ao usuário para dar refresh; confirmar visualmente: sidebar mostra "Super Admin › Feature Flags", context switcher lista todas as marcas, `/super-admin/features` abre sem redirecionar.

## Detalhes técnicos

SQL da migração (uma única call):

```sql
-- 1. Promover n3@unitos.com
UPDATE public.user_profiles
SET is_super_admin = true, updated_at = now()
WHERE id = 'b8df48a3-63f0-4d2d-8dc9-0060970f691a';

-- 2. RPC passa a reconhecer role='super_admin' também
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin OR role = 'super_admin'
     FROM public.user_profiles
     WHERE id = _user_id),
    false
  );
$$;
```

## Fora de escopo

- Não altero papéis normais (owner/manager/editor/designer/client) nem policies.
- Não removo a allowlist por e-mail em `is_super_admin()`.
- Não crio UI para gerenciar super admins — se necessário, fica para um próximo passo.
