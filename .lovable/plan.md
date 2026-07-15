## Configurações — alinhar com os prints (5 abas + dados de empresa)

### Nova estrutura de abas
```
Meu Perfil │ Equipe │ Permissões │ Auditoria │ Notificações
```
- `settings.tsx`: substituir tabs por Perfil, Equipe, Permissões, Auditoria, Notificações (ícones User, Users, ShieldCheck, History, Bell).
- `Governança de IA` (`settings.ai.tsx`) sai da barra de tabs. Rota preservada e acessível via /settings/ai; adiciono link discreto dentro de Permissões > Funções (é onde faz sentido no contexto do print). Não remover a rota.
- `settings.logs.tsx` renomeado visualmente para "Auditoria" (título e subtítulo), mesma rota `/settings/logs` mantida para não quebrar links.

### Migração (uma única, sem tocar em auth.users)
`ALTER TABLE public.brands` adiciona: `cpf text`, `cnpj text`, `nome_fantasia text`, `razao_social text`, `cep text`, `rua text`, `numero text`, `complemento text`, `bairro text`, `cidade text`, `estado text` (todos nullable).

`ALTER TABLE public.user_profiles` adiciona:
- `whatsapp text`
- `notify_whatsapp boolean default false`
- `notification_prefs jsonb default '{"email":true,"push":true,"whatsapp_client_portal":false,"comments":true,"approvals":true,"publications":true}'::jsonb`

Nada de novas RLS — as políticas atuais já cobrem `user_profiles` (dono lê/atualiza próprio) e `brands` (membros da marca). Reaproveitar.

### Meu Perfil (`settings.profile.tsx`)
Reordenar conforme o print:
1. **Cabeçalho**: Avatar grande com botão câmera (usa `avatar_url` — placeholder por enquanto abre input de URL, storage já existe se quisermos futuramente), nome, email, badge do role.
2. **Dados pessoais** (seção com ícone `User`):
   - Nome completo (obrigatório)
   - Email (readonly, com hint "O email não pode ser alterado")
   - WhatsApp para notificações
   - Toggle "Receber notificações por WhatsApp de publicações aprovadas e ajustes" (grava `notify_whatsapp`)
3. **Dados da empresa** (ícone `Building2`) — só aparece se `brandId` ativo E papel = owner/manager/admin.full. Campos: CPF, CNPJ, Nome fantasia, Razão social. Server fn nova `updateBrandCompany` valida com Zod e persiste.
4. **Endereço** (ícone `MapPin`) — mesma condição. Campos em grid: CEP, Rua, Número, Complemento, Bairro, Cidade, Estado (Select com 27 UFs). Persistidos pela mesma `updateBrandCompany`.
5. Botão **Salvar alterações** (perfil + empresa em duas chamadas paralelas se ambos estiverem dirty).
6. **Alterar Senha** (ícone `KeyRound`): Nova senha + Confirmar senha, botão desabilita até 8 caracteres e match. Já funciona hoje.

### Equipe (`settings.team.tsx`)
Manter fluxo atual (convite por link + provisionamento com senha temporária), sem substituir. Ajustes:
- Header do card estilo do print: título "Membros da Equipe" + subtítulo + botão primário "Convidar" (mantém texto atual porque hoje é convite; o print 3 abre outro fluxo que o usuário decidiu NÃO adotar nesta rodada).
- Estilo de linha do membro: avatar circular + nome + email + badge do role à direita (proprietário destacado com ícone crown).

### Permissões (`settings.permissions.tsx`) — NOVA rota
Duas sub-abas com Tabs shadcn:
- **Funções**: lista de papéis do sistema (Administrador, Gerente, Editor, Designer, Cliente) — vindos de `PERMISSION_GROUPS` + preset por role. Cada cartão mostra nome + badge "Sistema" + contagem de permissões + descrição + chips das permissões. Botão "Nova Função" fica desabilitado com tooltip "Em breve" (não existe backend de custom roles).
- **Permissões (Matriz)**: tabela com colunas = papéis do sistema, linhas = permissões agrupadas por categoria (Análises, Painel de Produção, Equipe, Financeiro, Geral, Navegação, Tarefas — derivadas de `PERMISSION_GROUPS`). Cada célula = ícone verde de check para Admin (fixo, sempre on), Switch shadcn read-only para os outros presets (só visualização — igual print, é uma matriz informativa).
- Rodapé com callout "Administradores têm acesso total".
- Reaproveita 100% os dados de `src/lib/permissions.ts`; nenhuma mutação de backend.

### Auditoria (`settings.logs.tsx`)
Ajuste cosmético para casar com o print:
- Título passa a "Log de Auditoria", subtítulo "Histórico de ações realizadas na organização".
- Manter filtros existentes de fonte + severidade (já supera o print).
- Linha do evento: avatar do ator + nome + badge colorido do tipo de evento + texto curto entre aspas + timestamp relativo + absoluto à direita.

### Notificações (`settings.notifications.tsx`) — NOVA rota
Uma única página com dois blocos, persiste em `user_profiles.notification_prefs`:
- **Canais de Notificação**: 4 toggles com ícones (Mail, Bell, WhatsApp verde, WhatsApp verde) — Email, Push, WhatsApp (mesmo `notify_whatsapp` do perfil, refletido), WhatsApp para clientes do portal.
- **Tipos de Notificação** (subtítulo "email e interno"): 3 toggles — Comentários, Aprovações, Publicações.
- Botão "Salvar preferências" abaixo.

Server fns novas em `src/lib/profile.functions.ts`:
- `getNotificationPrefs` / `updateNotificationPrefs` (jsonb).
- `updateBrandCompany` em `src/lib/workspace.functions.ts` (ou novo `brand-company.functions.ts`).

### Arquivos afetados
- Migração Supabase (uma call).
- `src/routes/_authenticated/settings.tsx` (nova barra de tabs).
- `src/routes/_authenticated/settings.profile.tsx` (reescrita ampla).
- `src/routes/_authenticated/settings.permissions.tsx` (novo).
- `src/routes/_authenticated/settings.notifications.tsx` (novo).
- `src/routes/_authenticated/settings.logs.tsx` (título/subtítulo).
- `src/routes/_authenticated/settings.team.tsx` (ajuste visual do header do card).
- `src/lib/profile.functions.ts` (novos endpoints + campos whatsapp/notify).
- `src/lib/workspace.functions.ts` (novo `updateBrandCompany` + `getBrandCompany`).

### Fora do escopo (o usuário escolheu opção 2, não opção 3)
- Fluxo "Criar Novo Membro" com senha direta do print 3 (mantemos convite por link + provisionamento existente).
- Editor de função customizada (botão "Nova Função" fica visual + "Em breve").
- Toggles da matriz de permissões editáveis (matriz é somente leitura nesta rodada).
