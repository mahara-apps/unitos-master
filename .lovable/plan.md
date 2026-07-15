## Diagnóstico

Consultei o banco e a causa raiz é clara — **não é o dashboard, é RLS bloqueando todos os `SELECT`**.

**Dados que existem no banco (via service role):**
- 1 brand ("Pitada Digital", criada por Bruno), 1 cliente, 1 projeto, 30 posts, 12 tarefas, 71 eventos de atividade
- Todos os posts estão em `stage='idea'` e agendados, 7 tarefas atrasadas, 1 concluída nos últimos 7d

**O que a UI recebe:** zero. Porque:

- Todas as policies de `posts`, `tasks`, `clients`, `projects`, `activity_events`, `brand_ai_usage`, `client_briefings` usam `is_brand_member(brand_id, auth.uid())`.
- A tabela `brand_members` está **vazia**. O único usuário (Bruno) criou a brand mas nunca virou membro dela.
- O trigger `trg_brands_add_owner` existe hoje, mas a brand atual foi criada antes/fora do fluxo que dispara o trigger — logo, ficou órfã.
- Com `brand_members` vazio, o `useActiveContext` até resolve o `brandId` (via `brands` policy, que também usa `is_brand_member`, mas a brand aparece por outro caminho — provavelmente cache/RLS residual), mas todas as leituras subsequentes voltam vazias → dashboard mostra tudo zerado.

Também confirmei que a função `is_super_admin()` existe (retorna `true` para `apitadadigital@gmail.com` e `jose@mahara.marketing`), mas **nenhuma policy nem o `is_brand_member` a consultam** — então super-admins também veem vazio.

## Correção proposta (uma migration, três camadas)

### 1. Backfill de `brand_members`
Para toda brand existente cujo `created_by` não é membro, inserir a linha `owner`:

```sql
INSERT INTO public.brand_members (brand_id, user_id, role)
SELECT b.id, b.created_by, 'owner'
FROM public.brands b
WHERE b.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.brand_members m
    WHERE m.brand_id = b.id AND m.user_id = b.created_by
  );
```

Isso destrava imediatamente o dashboard do Bruno (e de qualquer outro criador de brand que tenha ficado órfão).

### 2. Bypass global para super-admins
Reforçar `is_brand_member` para retornar `true` quando o usuário é super-admin, mantendo a assinatura atual (nenhuma policy precisa mudar):

```sql
CREATE OR REPLACE FUNCTION public.is_brand_member(_brand_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT is_super_admin FROM public.user_profiles WHERE id = _user_id), false)
    OR EXISTS (SELECT 1 FROM public.brand_members WHERE brand_id = _brand_id AND user_id = _user_id);
$$;
```

Com isso, `apitadadigital@gmail.com` e `jose@mahara.marketing` passam a enxergar todas as brands e derivados (posts, tasks, projetos, activity, IA usage, briefings, clients, projects) sem precisar virar membro de cada workspace.

### 3. Garantia futura no trigger
O trigger `trg_brands_add_owner` já existe, mas hoje só cobre `INSERT`. Vou reafirmá-lo com `ON CONFLICT DO NOTHING` (já está) e garantir que dispare `AFTER INSERT`. Se estiver correto, não altero — apenas confirmo. Nenhuma nova brand ficará órfã.

## Escopo intencionalmente fora deste plano

- Erro `Cannot read properties of undefined (reading '_nonReactive')` no `preloadRoute` — bug transiente do TanStack Router (preload de intent), não bloqueia dados.
- Erro `cannot add postgres_changes callbacks after subscribe()` no `notifications-drawer.tsx:112` — bug real de ordem de chamada, mas independente dos dashboards. Marcar como próximo passo.
- Dashboard do Cliente (`customer-dashboard.functions.ts`) e Analytics (`analytics.functions.ts`) usam as **mesmas policies**, então também destravam com o backfill + bypass — não precisam de mudança de código.

## Verificação pós-fix

1. Rodar `SELECT count(*) FROM brand_members;` — esperado ≥ 1.
2. No app, recarregar `/dashboard` como Bruno — KPIs devem mostrar: 1 cliente, 11 tarefas abertas, 7 atrasadas, 30 posts (todos em "Ideia" no funil), 71 eventos no sparkline.
3. Logar como super-admin (jose@ ou apitadadigital@) e trocar de workspace — deve ver todas as brands cadastradas.