# Fluxo de Agendamento e Distribuição — `/calendar`

Separar produção (`/content`) de distribuição (`/calendar`), reaproveitando schema existente (`posts`, `post_placements`, `social_connections`, `card_approval_tokens`). Sem novas tabelas.

## 1. Refatoração da rota `/calendar`

**Nova estrutura** em `src/routes/_authenticated/calendar.tsx`:
- Header com toggle **Semana / Mês** + filtros (cliente já vem do contexto ativo; filtro por canal).
- Botão **"Novo agendamento"** → abre wizard do zero (post nasce em `stage='approved'`, pulando aprovação).
- Grade principal (semana ou mês) exibindo `post_placements` com `scheduled_at`; cards compactos: thumbnail, ícones de canal, horário, status semântico (`scheduled` / `published` / `failed`).
- **Painel lateral "Aguardando agendamento"**: lista `posts` com `stage='approved'` e sem `scheduled_at`, ordenada por `approved_at`; clique abre wizard no Passo 01 herdando copy/mídia.
- Buracos de programação: dias sem posts com opacidade/borda tracejada sutil.
- Remover do calendário atual: KPIs por formato, ação de "gerar plano" (essa continua em `/content` se já existir).

## 2. Wizard de agendamento — `src/components/calendar/schedule-wizard/`

Modal multi-step controlado, pré-requisito: `clientId` ativo. Todas as buscas de `social_connections` filtram por `client_id`.

**Passo 01 — Canais e formatos** (`step-channels.tsx`)
- Grid dos canais de `SOCIAL_CHANNELS` (`src/lib/social-core/capabilities.ts`).
- Estado por canal: `conectado` (nome/avatar da conta em `social_connections`), `sem integração` (CTA "Conectar" → OAuth existente).
- Formatos válidos por canal (regra local): IG {feed, story, reel, carousel}; FB {feed}; LinkedIn {feed}; TikTok {reel}; YouTube {reel}; X {feed}; Threads {feed}.
- Multi-seleção canal × formato. Bloqueia "Continuar" sem conexão ativa do cliente ou sem par válido.

**Passo 02 — Editor** (`step-editor.tsx`)
- Esquerda: upload múltiplo (drag-reorder) via bucket privado `brand-media` (já existente); legenda com contador respeitando limite mais restrito entre destinos; hashtags em chips; assinatura fixa do cliente (Brand Hub, se existir); variáveis dinâmicas (reaproveitar `agent-variables.functions.ts` se compatível); **override por destino** grava em `post_placements.copy_override` (jsonb).
- Direita: preview por rede/formato em tabs; visual fiel à rede (única exceção ao design system).

**Passo 03 — Resumo** (`step-summary.tsx`)
- Lista final destino × conta × mídia.
- Ações: **Salvar rascunho** / **Publicar agora** / **Agendar** (abre Passo 04). **Sem** botão de aprovação.

**Passo 04 — Data/hora** (`step-schedule.tsx`)
- Data + hora; validação `scheduled_at >= now() + 5min`; exibe timezone de `user_profiles.timezone`.
- Confirmar grava `scheduled_at` no `posts` e propaga para cada `post_placements`, e move `stage` para `'scheduled'`.

## 3. Server functions — `src/lib/scheduling-wizard.functions.ts`

Todas com `requireSupabaseAuth`:
- `listClientSocialConnectionsFn({ brandId, clientId })` — só conexões ativas do cliente.
- `listApprovedUnscheduledFn({ brandId, clientId })` — painel lateral.
- `createOrUpdateScheduledPostFn({ postId?, brandId, clientId, title, copy, mediaPaths, hashtags, destinations: [{channel, format, connectionId, copyOverride?}], scheduledAt?, action: 'draft'|'publish'|'schedule' })`:
  - Upsert em `posts` (respeitando trigger de `add_brand_owner` e RLS).
  - Sync de `post_placements` por par (channel, format): insert/update/delete.
  - Grava `scheduled_at` conforme `action`; `stage='approved'` para rascunho vindo do wizard direto; `'scheduled'` quando agenda.
- `publishNowFn({ postId })` — enfileira via Social Core / worker existente (não reimplementar).

## 4. Integridade
- Resolver conexão sempre pelo `client_id` explícito (nunca "primeira ativa").
- URLs de mídia sempre via signed URL dinâmica (bucket privado) — nunca URL pública gravada.
- Sem alteração no kanban de `/content` nem duplicação da ação de aprovação.

## Detalhes técnicos

- **Sem migration** — schema já cobre tudo.
- Reaproveita `TaskDialog` só para abrir cards vindos do calendário no modo edit (fluxo atual mantido); wizard é componente novo, não substitui `TaskDialog`.
- Formatos válidos por canal ficam num mapa isomórfico em `src/lib/scheduling-formats.ts` (novo, sem tabela).
- Design tokens de `src/styles.css`; exceção documentada nos previews das redes.

## Arquivos novos
```text
src/lib/scheduling-formats.ts
src/lib/scheduling-wizard.functions.ts
src/components/calendar/schedule-wizard/index.tsx
src/components/calendar/schedule-wizard/step-channels.tsx
src/components/calendar/schedule-wizard/step-editor.tsx
src/components/calendar/schedule-wizard/step-summary.tsx
src/components/calendar/schedule-wizard/step-schedule.tsx
src/components/calendar/schedule-wizard/network-preview.tsx
src/components/calendar/pending-schedule-panel.tsx
src/components/calendar/week-grid.tsx
```

## Arquivos alterados
```text
src/routes/_authenticated/calendar.tsx  (toggle semana/mês, botão novo, painel lateral, filtro canal)
src/lib/calendar.functions.ts           (+ listApprovedUnscheduledFn se preferir aqui)
```
