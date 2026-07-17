# Criação manual de usuários com escopo por workspace e projeto

Novo fluxo administrativo para provisionar contas com senha temporária, atribuindo workspaces (marcas) e projetos (clientes) específicos, com e-mail apenas informativo.

## 1. Modelo de dados — escopo real por projeto

Nova tabela `public.client_members` para restringir visibilidade a clientes específicos dentro de uma marca:

- Colunas: `brand_id`, `client_id`, `user_id`, `role` (herda dos papéis atuais), `created_at`, `created_by`.
- Constraint única `(client_id, user_id)`.
- GRANTs para `authenticated` + `service_role`, RLS habilitado.
- Policies: leitura pelo próprio usuário ou por owner/manager da marca; escrita apenas por super admin ou owner/manager da marca.

Função `public.can_access_client(_client_id, _user_id)` (`SECURITY DEFINER`) com a regra:

```
super_admin? OR
membro em client_members(_client_id, _user_id)? OR
(nenhum registro em client_members para esse cliente E is_brand_member(brand_id, _user_id))
```

Isso preserva o comportamento atual (marca sem restrição por cliente = todos veem tudo) e ativa o escopo assim que ao menos 1 linha de `client_members` existir para o cliente. Zero migração destrutiva.

Atualizar policies das tabelas escopadas por cliente para consultar essa função no lugar de `is_brand_member(brand_id, auth.uid())` isolado: `clients`, `posts`, `post_placements`, `post_approvals`, `tasks`, `projects`, `brand_briefings`, `brand_ai_content`, `brand_ai_versions`, `brand_personas`, `brand_swot`, `brand_competitors`, `brand_pautas`, `brand_voice_cards`, `client_documents`, `client_briefings`, `client_briefing_tokens`, `media_plans`, `media_plan_items`, `activity_events`, `card_approval_tokens`, `card_approval_events`.

## 2. Server function `provisionUser`

`src/lib/team.functions.ts` → `provisionUser` com `requireSupabaseAuth`:

1. **Autorização**: caller precisa ser super admin OU owner/manager em todas as marcas passadas em `assignments`. Rejeita workspaces onde não tem esse papel.
2. **Input** (Zod): `email`, `fullName`, `assignments: [{ brandId, role, permissions, clientIds?: string[] }]`, `sendEmail: boolean` (default true).
3. **Fluxo**:
   - Gera senha temporária (16 chars) via `crypto.randomBytes`.
   - `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, must_reset_password: true } })`. Se usuário já existe, retorna erro claro sugerindo usar "Adicionar existente".
   - Marca `user_profiles.must_reset_password = true` (gate já existente no login).
   - Para cada assignment: upsert em `brand_members` + insert em `client_members` para cada `clientId`.
   - Se `sendEmail`: envia via template Resend existente (`sendCredentialsEmail`) listando workspaces + projetos atribuídos + senha temporária. Falha no envio é **warning**, não bloqueia — retorna a senha para exibição na UI.
4. **Retorno**: `{ userId, email, tempPassword, emailStatus }`.

## 3. UI — `/settings/team`

Novo botão **"Criar usuário"** ao lado de "Adicionar existente" e "Convidar" (visível apenas para super admin / owner / manager).

Componente `CreateUserDialog` (Sheet 640px):

- **Passo 1 — Identidade**: nome, e-mail.
- **Passo 2 — Acesso**: lista de workspaces em que o caller tem permissão (super admin vê todos). Para cada workspace selecionado:
  - Seletor de papel (owner/manager/editor/designer/client).
  - Checkboxes de permissões (matriz atual).
  - Toggle **"Restringir a projetos específicos"** — quando ativo, mostra multi-select dos clientes daquela marca. Vazio = acesso a todos os clientes (padrão atual).
- **Passo 3 — Confirmação**: preview do resumo + toggle "Enviar e-mail de boas-vindas".

Após sucesso: modal com senha temporária + botão copiar + aviso "usuário terá que redefinir no primeiro login". Invalida queries de `team` e `brands`.

## 4. Consistência

- `MandatoryPasswordReset` já existente cobre a troca no primeiro login (nenhuma mudança).
- `AddExistingUserDialog` ganha uma linha secundária "Restringir a projetos" com o mesmo multi-select, escrevendo em `client_members` quando marcado.
- `settings.team.tsx` ganha coluna "Projetos" no card do membro mostrando `Todos` ou a lista de clientes escopados.
- Template de e-mail em `src/lib/email-templates.ts` recebe seções "Workspaces" e "Projetos com acesso" (informativo, não gate).

## Detalhes técnicos

- Migração única com: `CREATE TABLE client_members` + GRANTs + RLS + policies + `can_access_client` + `ALTER POLICY` em cada tabela listada acima.
- `provisionUser` importa `supabaseAdmin` dentro do handler (regra de import graph).
- Envio de e-mail reusa a integração Resend já configurada em `team.functions.ts`.
- Nenhuma quebra: clientes sem linhas em `client_members` continuam visíveis para todos os membros da marca.
