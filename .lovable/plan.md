
## Objetivo

Evoluir `/calendar` para exibir três tipos de eventos com cores distintas (Post, Compromisso, Data Sazonal) e mostrar ícones das redes sociais dos posts diretamente nas células do calendário — mantendo a estética Vercel/Supabase.

## 1. Backend — nova tabela `calendar_events`

Migration criando a tabela unificada para Compromissos e Datas Sazonais (Posts continuam vindo de `posts` + `post_placements`):

```sql
CREATE TYPE public.calendar_event_type AS ENUM ('appointment', 'seasonal');

CREATE TABLE public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade, -- null = escopo brand
  type calendar_event_type not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  is_global boolean not null default false, -- sazonais globais (feriados)
  color text, -- override opcional
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

RLS: membros da brand podem CRUD; sazonais `is_global=true` são SELECT público para todos os autenticados. Grants completos para `authenticated` e `service_role`. Índice em `(brand_id, starts_at)`.

## 2. Server functions — `src/lib/calendar-events.functions.ts`

- `listCalendarEventsFn({ brandId, clientId, from, to })` — retorna eventos + sazonais globais no range.
- `upsertCalendarEventFn` (Zod validated).
- `deleteCalendarEventFn`.
- `listScheduledPostsFn` existente permanece; frontend faz merge dos dois streams.

## 3. Frontend — refatoração do `/calendar`

### 3.1 Tipos e cores unificados
Novo `src/lib/calendar-tokens.ts` com:
- `EVENT_TYPE_STYLES` — `{ post: neutral/brand, appointment: blue-500/10, seasonal: orange-500/10 }` (border, bg, text) em OKLCH consistentes com design system.
- `SOCIAL_NETWORK_ICONS` — mapa `instagram|facebook|linkedin|tiktok|youtube|whatsapp|threads|x` → `{ Icon (lucide), brandColor }`.

### 3.2 Célula do dia (`DayCell`)
Nova estrutura dentro da grid (extraída em componente):
- Cabeçalho: número do dia + contador + botão "+" (mantidos).
- **Row de ícones de rede** (novo): agrupamento dos canais únicos de todos os posts do dia. Ícones `w-3 h-3` em `text-muted-foreground`, hover ganha cor da marca. Máx 4 visíveis; excedente vira `+N`.
- Lista de eventos (mistura posts + compromissos + sazonais), ordenada por hora, limite 3 → popover "+X mais".

### 3.3 Chip por tipo (`EventChip`)
Substitui `PostChip`. Recebe union type e aplica:
- `post` → estilo atual (canal/formato).
- `appointment` → azul (`border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400`).
- `seasonal` → âmbar (`border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400`).
Cada chip mostra hora (exceto `all_day`), título truncado e badge minúsculo do formato quando post.

### 3.4 Header + Wizard
- Botão dropdown "Novo": **Agendar publicação** (wizard atual) | **Novo compromisso** | **Nova data sazonal**.
- Novo `EventDialog` (shadcn Dialog) com: tipo, título, descrição, `all_day` toggle, data/hora início e fim, escopo (workspace/cliente/global — global só super_admin), botão excluir em modo edit.
- Clique em chip de compromisso/sazonal abre `EventDialog` em modo edit; clique em post mantém `TaskDialog`.

### 3.5 KPIs
Manter os 4 cards de formato existentes (Feed/Stories/Reels/Carrossel) — pedido não altera essa camada.

## 4. Sazonais pré-carregados (opcional, mesma migration)

Seed de ~12 datas comemorativas BR (Ano Novo, Carnaval, Dia das Mães, etc.) inseridas como `is_global=true, brand_id=null`... **descartado**: schema exige `brand_id not null`. Alternativa: manter `brand_id not null` e o super_admin popula quando quiser; ou permitir `brand_id null` quando `is_global=true` (RLS ajustada). **Decisão do plano: `brand_id nullable` + policy que só permite `is_global=true` quando null, gerenciado apenas por super_admin.**

## 5. Ajustes técnicos

- `useQuery` novo `["calendar-events", brandId, clientId, from, to]` em paralelo ao `["calendar", ...]`.
- `invalidateKey` compartilhado atualizado nos dialogs.
- `PendingSchedulePanel` inalterado.
- Nenhuma mudança em `/content`.

## Arquivos alterados/criados

- Migration: `calendar_events` + enum + RLS + grants.
- `src/lib/calendar-events.functions.ts` (novo).
- `src/lib/calendar-tokens.ts` (novo).
- `src/components/calendar/day-cell.tsx` (novo, extraído).
- `src/components/calendar/event-chip.tsx` (novo).
- `src/components/calendar/event-dialog.tsx` (novo).
- `src/components/calendar/social-icons-row.tsx` (novo).
- `src/routes/_authenticated/calendar.tsx` (refatorado header + grid + merge de queries).

## Fora de escopo

- Recorrência de eventos (RRULE) — versão futura.
- Notificações/lembretes de compromissos.
- Sincronização Google Calendar/iCal.
