# Refatorar headers de `/content` e `/calendar`

Consolidar headers em um único componente por rota, cada um com um CTA primário claro. Remover o `GeneratePlanDialog` de `/calendar` e mover a geração por IA para `/content`.

## `/content`

Hoje existem **dois** `usePageHeader` (um em `ContentPage`, outro em `ContentReady`) — o segundo sobrescreve o primeiro e cria confusão. Consolidar em um único header em `ContentReady` com:

- **Título**: `Conteúdo` · **Subtítulo**: `Pipeline de conteúdo · <n> tarefas`.
- **Pipeline selector** + botão de settings (Novo/Renomear pipeline, Colunas) — mantidos.
- **Botão primário `Novo conteúdo`** (split button / dropdown):
  - `Manual` → abre `task-dialog` (Nova tarefa direta, sem IA).
  - `Gerar com IA` → abre `GeneratePlanDialog` (o mesmo que está hoje em `/calendar`).
- Remover o header duplicado de `ContentPage`, remover o `ComposerDialog` extra (`setComposerOpen`), e remover o `GeneratePlanDialog` isolado.

Resultado: 1 header enxuto, 1 CTA, 2 caminhos claros (manual vs IA).

## `/calendar`

- **Título**: `Calendário` · **Subtítulo**: `<mês/ano capitalizado> · <n> posts agendados`.
- **Actions** (esquerda → direita, agrupadas visualmente):
  - Toggle `Semana | Mês` (mantido).
  - Navegação `‹  Hoje  ›` (mantido).
  - CTA primário **`Agendar publicação`** (renomeia "Novo agendamento") → abre `ScheduleWizard` existente.
- **Remover** o `GeneratePlanDialog` do header (geração por IA fica exclusiva em `/content`).
- Remover import não utilizado do `GeneratePlanDialog` em `calendar.tsx`.

## Arquivos

- `src/routes/_authenticated/content.tsx` — consolidar headers, adicionar dropdown Manual/IA, remover `ComposerDialog` isolado.
- `src/routes/_authenticated/calendar.tsx` — renomear CTA, remover `GeneratePlanDialog` + import.

Sem mudanças em schema, server functions ou no `ScheduleWizard`/`GeneratePlanDialog` em si.
