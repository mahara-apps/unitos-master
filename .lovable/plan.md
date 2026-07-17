## Objetivo

Permitir adicionar um usuário **que já existe no sistema** direto ao workspace (marca) atual, sem passar pelo fluxo de convite por e-mail + aceite.

## Backend — `src/lib/team.functions.ts`

Adicionar server fn `addExistingUserToBrand`:

- Input: `{ brandId: uuid, email: string, role: enum(owner/manager/editor/designer/client), permissions: PermissionId[] }`.
- Autorização: caller precisa ser `owner` ou `manager` da `brandId` (mesma checagem já usada em `inviteBrandMembers`).
- Busca do usuário: `supabaseAdmin.auth.admin.listUsers` com paginação simples até casar o e-mail (case-insensitive). Import dinâmico dentro do handler.
- Se **não encontrado** → retorna `{ status: "not_found" }` para o front sugerir usar o fluxo de convite.
- Se **encontrado** → `upsert` em `brand_members (brand_id, user_id, role, permissions)` com `onConflict: "brand_id,user_id"` para promover/atualizar caso já seja membro (`{ status: "already_member" }` quando o registro já existia idêntico; `{ status: "added" }` quando novo; `{ status: "updated" }` quando role/perms mudaram). Sempre retorna `user_id` e `full_name` (join em `user_profiles`) para o toast.
- Sem envio de e-mail e sem `brand_invites` — é atribuição direta.

## Frontend — `src/routes/_authenticated/settings.team.tsx`

- Novo botão secundário no header ao lado de "Convidar": **"Adicionar existente"**.
- Componente `AddExistingUserDialog` (mesmo padrão do `InviteDialog`, bem mais enxuto):
  - Campo único de e-mail + `Select` de papel + checkboxes de permissões (reusa `PERMISSION_GROUPS` já usados no invite).
  - Ao confirmar, chama `addExistingUserToBrand`, invalida a query `["brand-team", brandId]`, mostra toast conforme o `status` retornado (adicionado / atualizado / já era membro / não encontrado — nesse último com CTA "Enviar convite" que abre o `InviteDialog` pré-preenchido com o e-mail).
  - Fecha ao final e mantém o dialog acessível (labels + `aria-*`).

Sem outras mudanças de UI, RLS ou schema — a promoção direta é feita via `supabaseAdmin` (server-side), respeitando a autorização de papel do chamador.

## Validação

- Como owner, adicionar um e-mail existente que **não** é membro → aparece na lista de membros com o papel escolhido.
- Adicionar um e-mail que já é membro com papel diferente → atualiza papel/permissões, toast "atualizado".
- Adicionar um e-mail inexistente → toast "não encontrado" com CTA para convidar.
- Como editor/designer, o botão devolve `forbidden` (mesmo comportamento do invite).
