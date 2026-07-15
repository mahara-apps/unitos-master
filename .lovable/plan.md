## Templates de mensagens (E-mail + WhatsApp) na aba Mensageria

Adicionar um bloco **"Templates de comunicação"** dentro de `/connections` → aba Mensageria, com editor rico, sistema de variáveis, preview e persistência por brand. Cada template pertence a um **canal** (`email` | `whatsapp`) e a um **evento do sistema** (chave imutável), com corpo editável em Markdown/HTML e suporte a variáveis `{{nome_da_variavel}}`.

### Eventos cobertos (seed automático por brand)

Vinculados a fluxos reais do NexusFlow:

| Evento | Canal padrão | Contexto |
|---|---|---|
| `team_invite` | email | Convite de acesso (usa `team.functions.ts`) |
| `team_welcome` | email | Boas-vindas após aceitar convite |
| `password_reset` | email | Recuperação de senha (`forgot-password`) |
| `client_onboarding` | email | Novo cliente cadastrado |
| `client_briefing_request` | email | Solicitar briefing via token |
| `portal_access` | email + whatsapp | Envio do link do portal white-label |
| `post_pending_approval` | email + whatsapp | Novo post aguardando aprovação do cliente |
| `post_approved` | whatsapp | Cliente aprovou — notificar equipe |
| `post_rejected` | whatsapp | Cliente pediu ajustes |
| `weekly_report` | email | Relatório semanal de performance |
| `monthly_report` | email | Relatório mensal com KPIs e insights |
| `task_assigned` | whatsapp | Tarefa atribuída ao responsável |
| `payment_reminder` | email | Lembrete de fatura |

Cada evento tem defaults em pt-BR já preenchidos (assunto + corpo), editáveis pelo usuário.

### Sistema de variáveis

Variáveis contextuais tipadas por evento, resolvidas server-side no envio:

- **Marca**: `{{brand.name}}`, `{{brand.logo}}`
- **Cliente**: `{{client.name}}`, `{{client.contact_name}}`, `{{client.email}}`
- **Usuário**: `{{user.full_name}}`, `{{user.email}}`, `{{user.role}}`
- **Post/Tarefa**: `{{post.title}}`, `{{post.channel}}`, `{{post.scheduled_at}}`, `{{task.title}}`, `{{task.due_at}}`
- **Portal**: `{{portal.url}}`, `{{portal.expires_at}}`
- **Convite**: `{{invite.url}}`, `{{invite.role}}`, `{{invite.password}}`
- **Relatório**: `{{report.period}}`, `{{report.approved_count}}`, `{{report.published_count}}`, `{{report.top_post}}`

O painel do editor lista somente as variáveis válidas para o evento selecionado (chip clicável que insere no cursor).

### UI — editor senior

Novo card **"Templates de comunicação"** na aba Mensageria, abaixo dos KPIs:

```text
┌ Templates ──────────────────────────────────────────────┐
│ [Sidebar: lista de eventos]  │ [Editor]                 │
│  ⚙ Convite de acesso  · email│ Assunto: [_______]       │
│  ✉ Boas-vindas         · email│ Preview: Desktop │ Mobile│
│  📊 Relatório mensal   · email│ ┌ Editor rich text ────┐│
│  💬 Post aprovado      · whats│ │ B I U · H1 H2 · link  ││
│  ...                          │ │ {{brand.name}} chip   ││
│                               │ └───────────────────────┘│
│                               │ Variáveis: [chips]       │
│                               │ [Preview] [Enviar teste] │
│                               │ [Salvar] [Restaurar]     │
└─────────────────────────────────────────────────────────┘
```

- **Editor**: `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-link` + `@tiptap/extension-placeholder`. Para WhatsApp, toolbar reduzida (bold, italic, strike, listas — sem headings/links inline, alinhado ao formato WhatsApp).
- **Variáveis**: extensão custom do Tiptap que renderiza `{{var}}` como badge não editável (previne quebrar sintaxe). Painel lateral com chips agrupados por escopo.
- **Preview**: renderiza com dados de amostra (mock por evento). Toggle Desktop/Mobile para email; bolha de WhatsApp para o outro canal.
- **Enviar teste**: dispara para o e-mail/telefone do usuário logado usando o provider configurado na aba (Resend para email; Evolution/Cloud para WhatsApp).
- **Restaurar padrão**: reverte para o template seed do sistema.
- **Status badges**: "Padrão do sistema" vs "Personalizado por você" vs "Rascunho".

### Persistência e backend

Nova tabela `public.message_templates`:

- `brand_id uuid` (FK brands)
- `event_key text` (ex.: `team_invite`)
- `channel text` (`email` | `whatsapp`)
- `subject text` (só email)
- `body_html text` (email) / `body_text text` (whatsapp — armazena com sintaxe WhatsApp `*bold*` `_italic_`)
- `variables_used text[]`
- `is_active boolean default true`
- Unique (`brand_id`, `event_key`, `channel`)
- RLS: leitura/escrita por membros da brand; super-admin bypass.

Server functions em `src/lib/message-templates.functions.ts`:

- `listTemplates({ brandId })` — merge de defaults + overrides.
- `upsertTemplate({ brandId, eventKey, channel, subject, body })`.
- `resetTemplate({ brandId, eventKey, channel })` — deleta override.
- `sendTestMessage({ brandId, eventKey, channel, to })` — resolve variáveis com sample data e envia.
- `renderTemplate(brandId, eventKey, channel, context)` — helper interno para os fluxos existentes.

Catálogo de eventos + defaults + schema de variáveis em `src/lib/message-templates.catalog.ts` (source-of-truth, versionável em código).

### Integração com fluxos existentes

Substituir os corpos hardcoded pelos templates renderizados:

- `team.functions.ts` → `renderTemplate('team_invite')` em vez do HTML atual.
- `notifications` de portal (portal_decide) → dispara WhatsApp/email se template ativo.
- Relatórios (a criar) → usa `weekly_report`/`monthly_report`.

Fluxos não-existentes ficam "prontos para uso" quando a feature acontecer.

### Detalhes técnicos

- Instalar: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`.
- Renderização final para email: sanitizar HTML (`isomorphic-dompurify` já instalado? senão adicionar) e envelopar em template base responsivo (wrapper com logo da brand, footer legal).
- Renderização WhatsApp: converter HTML do Tiptap para sintaxe WhatsApp (`**` → `*`, `_` → `_`, listas com `•`).
- Envio de teste WhatsApp: usa credencial cifrada em `brand_api_credentials` (já implementada).
- Envio de teste Email: usa `RESEND_API_KEY` global (padrão já existente em `team.functions.ts`).
- i18n: pt-BR fixo (segue padrão do sistema).
- Arquivos novos:
  - `src/lib/message-templates.catalog.ts`
  - `src/lib/message-templates.functions.ts`
  - `src/lib/message-templates.render.server.ts` (sanitização + envio)
  - `src/components/messaging/template-editor.tsx`
  - `src/components/messaging/template-preview.tsx`
  - `src/components/messaging/variable-picker.tsx`
- Migração Supabase: cria `message_templates` com RLS + GRANTs para `authenticated` e `service_role`.

### Fora do escopo desta entrega

- Agendamento de envios em massa (broadcast).
- A/B testing de templates.
- Templates HomologatedTemplates da Meta WhatsApp Cloud (exige aprovação da Meta — pode ser fase 2).
- Editor visual de blocos tipo Mailchimp (mantemos rich-text puro).
