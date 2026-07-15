Alinhar as três telas ao padrão visual usado em `settings.logs.tsx` (Auditoria) e `settings.permissions.tsx` (Permissões): container `max-w-6xl`, faixa de KPIs no topo, blocos em `Card` com `CardHeader` + `CardContent`, filtros/abas dentro do card, tipografia e paddings idênticos. Sem alterar backend nem lógica de dados — só apresentação.

## Meu Perfil (`settings.profile.tsx`)

- Trocar container `max-w-3xl` por `max-w-6xl` e grid de 2 colunas (`lg:grid-cols-3`): coluna lateral (1/3) com identidade + resumo; coluna principal (2/3) com os formulários em `Tabs`.
- Faixa superior com 4 StatCards no mesmo estilo de Auditoria: Função, Fuso, Idioma, Notificações ativas.
- Reorganizar os 4 cards atuais em `Tabs` dentro de um único `Card` grande:
  - `Pessoal` (nome, telefone, WhatsApp, cargo, bio, avatar, fuso, idioma)
  - `Empresa` (CPF/CNPJ, nome fantasia, razão social) — só admin
  - `Endereço` (CEP, rua, número, complemento, bairro, cidade, UF) — só admin
  - `Segurança` (nova senha + confirmar)
- Botão "Salvar" migra para o header via `usePageHeader.actions` (padrão do sistema); botão inline vira secundário.

## Equipe (`settings.team.tsx`)

- Container `max-w-6xl` e mesmo `p-6`.
- Faixa superior com 4 StatCards: Membros ativos, Convites pendentes, Portais ativos, Admins.
- Envelopar as 3 seções (Membros, Convites, Portais) em `Card` com `CardHeader` (título + descrição curta) + `CardContent`, substituindo o `<section>` cru e o header em `font-mono`.
- Adicionar barra de busca (`Input` com ícone Search) + `Tabs` (Todos / Owners / Managers / Editors / Designers / Clientes) dentro do card de Membros, no mesmo formato dos logs.
- Manter `Convidar` no `usePageHeader.actions` (já está).

## Notificações (`settings.notifications.tsx`)

- Container `max-w-6xl` (hoje é `max-w-3xl`).
- Faixa superior com 4 StatCards: Canais ativos, Tipos ativos, WhatsApp (on/off), Email (on/off).
- Layout 2 colunas (`lg:grid-cols-2`): "Canais de Notificação" (Email, Push, WhatsApp pessoal, WhatsApp portal cliente) e "Tipos de Notificação" (Comentários, Aprovações, Publicações), cada bloco em `Card`.
- Botão "Salvar preferências" movido para `usePageHeader.actions`, com estado `isPending` refletindo no header.

## Componente compartilhado

Extrair `SettingsStatCard` (baseado no `StatCard` interno de `settings.logs.tsx`) para `src/components/settings/settings-stat-card.tsx` e reutilizar nas 4 telas (inclui refactor leve em Auditoria e Permissões para adotar o componente).

## Fora de escopo

- Nenhuma mudança em `lib/*.functions.ts`, RLS, schemas ou navegação de `settings.tsx`.
- Nenhuma nova permissão, campo, template ou fluxo de negócio.