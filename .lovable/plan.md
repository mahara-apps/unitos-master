## Objetivo

Criar **um único componente de filtro de data** — inspirado no modelo enviado (calendário com presets laterais), 100% em português — e trocar todos os filtros de período do app por ele.

## Componente novo

**`src/components/ui/date-range-picker.tsx`** — combina Popover + Calendar (react-day-picker, já instalado) + coluna de presets.

- Trigger: botão outline com ícone `CalendarIcon` e label "01 out — 30 out" (formatado com `date-fns` locale `ptBR`).
- Popover: presets à esquerda + calendário 2 meses à direita.
- Locale `ptBR` no `<Calendar locale={ptBR}>` (nomes de dias/meses traduzidos automaticamente).
- Presets PT-BR:
  - Hoje
  - Ontem
  - Últimos 7 dias
  - Últimos 30 dias
  - Últimos 90 dias
  - Este mês
  - Mês passado
  - Este ano
  - Ano passado
  - Personalizado (calendário aberto para seleção manual)
- Props: `value: DateRange | undefined`, `onChange(range)`, `align?`, `disabled?`, `maxDate?` (default: `new Date()`).
- Também expõe helper `dateRangeToPeriodKey(range)` → `"7d" | "30d" | "90d" | "custom"` e `periodKeyToDateRange(key)` — para retrocompatibilidade com endpoints que aceitam `"30d"`.

## Filtros a substituir

Todos os locais que hoje usam Select "7d/30d/90d" ou date pickers próprios:

1. **`src/routes/_authenticated/analytics.tsx`** — remove `PRESETS` + Select, usa `<DateRangePicker>`. Converte range → `period` string (`Xd`) ou passa `since/until` para `SocialAnalyticsDashboard` (mantém contrato atual convertendo pra `Xd` quando bate um preset, `custom` cai num novo caminho — ver seção "Backend").
2. **`src/components/brain/brain-dashboard.tsx`** (linhas 470-472 e 510-512) — os dois `SelectTrigger` de período.
3. **`src/routes/_authenticated/dashboard.tsx`** — filtro de período do painel principal.
4. **`src/components/media-plans/create-media-plan-dialog.tsx`**, **`src/components/customer/monthly-plan-dialog.tsx`**, **`src/components/calendar/generate-plan-dialog.tsx`**, **`src/routes/_authenticated/customers.$customerId.media-plan.tsx`**, **`src/routes/_authenticated/media-plans.tsx`**, **`src/routes/plano.$planId.tsx`** — todos os inputs de "data início/fim" e "mês de referência" viram um único `<DateRangePicker>` (ou variante `mode="single"` do mesmo componente quando for data única).
5. **`src/components/brand-hub/briefing-workspace.tsx`** — datas de campanha.

## Backend (mínimo)

Para preservar cache das server fns atuais (`period: "30d"`), o wrapper converte:

- Range que bate exatamente um preset → mantém `period` string.
- Range custom → estende `getBrandSocialDashboardFn` / `getBrandSocialTopPayloadFn` para aceitar `{ since, until }` alternativo ao `period` (chave de cache passa a incluir since/until). Nenhuma mudança em providers.

## Escopo desta entrega

- Criar o componente + helpers.
- Trocar os filtros em **Analytics, Brain, Dashboard** (os três com filtro de período global) nesta primeira passada.
- Diálogos de plano/briefing (item 4-5) ficam como follow-up separado se você aprovar — envolvem `react-hook-form` e merecem PR próprio pra não misturar mudança visual com refactor de forms.

## Não faço

- Não altero visual do calendário mensal principal (`/calendar` route) — aquilo é um calendário de agendamento, não um filtro de intervalo.
- Não adiciono novas dependências (react-day-picker e date-fns já estão no projeto).

Confirma que topa começar por **Analytics + Brain + Dashboard** e deixar diálogos de plano/briefing para um segundo passo?