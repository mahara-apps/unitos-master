## Objetivo

Reestruturar o `TaskDrawer` (`src/components/tasks/shared.tsx`, linhas 664-929) para a estrutura **estilo Asana** da referência anexada: título grande no topo, ação primária "Concluir", metadados como **linhas rótulo → valor** e discussão ao fim com composer bem separado.

## Estrutura nova (mesma largura 640px)

```text
┌────────────────────────────────────────────────┐
│ [✓ Concluir]              [↑] [↓] [⋯] [×]     │  ← top bar (ação + nav)
├────────────────────────────────────────────────┤
│ Título grande (autosave onBlur)                │
│                                                │
│  Responsável   [👤 Bruno Abreu ▾]              │
│  Prazo         [📅 14 jul · 09:00 ▾]           │
│  Status        [● A fazer ▾]                   │
│  Prioridade    [● Média ▾]                     │
│  Conta         [Café Aurora ▾]                 │
│  Projeto       [Nenhum ▾]                      │
│                                                │
│  Descrição                                     │
│  ┌──────────────────────────────────────────┐  │
│  │ (textarea sem borda, inline)             │  │
│  └──────────────────────────────────────────┘  │
├────────────────────────────────────────────────┤
│ 💬 Discussão · 0                               │
│ (lista de comentários)                         │
├────────────────────────────────────────────────┤
│ [avatar] Escreva um comentário…    [Enviar ➤] │  ← composer sticky
├────────────────────────────────────────────────┤
│ 🗑 Excluir              Criada em 14 jul 2026  │
└────────────────────────────────────────────────┘
```

## Mudanças

### 1. Top bar (novo)
- Botão primário **"Concluir"** (troca para "Concluído ✓" com `variant="secondary"` quando `status==="done"`) → dispara `patchMutation` com `{ done: !isDone, status: isDone ? "todo" : "done" }`.
- À direita, cluster compacto: `↑` (K), `↓` (J), `⋯` (menu com Excluir), `×` (fechar). Remove o rótulo "TAREFA" em caps.

### 2. Título
- `Input` transparente `text-xl font-semibold`, mesma lógica de autosave onBlur. Fica logo abaixo do top bar, com padding maior (`px-6 pt-4 pb-2`).

### 3. Metadados como grid de propriedades (substitui a fileira caótica de chips)
- Grid `grid-cols-[120px_1fr] gap-y-2 gap-x-4` com 6 linhas: **Responsável, Prazo, Status, Prioridade, Conta, Projeto**.
- Rótulo `text-xs text-muted-foreground`, valor à direita como botão "ghost" enxuto que abre popover — visual limpo estilo Asana.
- Prazo: substitui `<input type="datetime-local">` cru por botão outline com ícone `CalendarClock` + label formatado (`d 'de' MMM · HH:mm`) e Popover com date/time (usa `<input type="datetime-local">` internamente).
- Status/Prioridade: `Select` continua funcional mas com `SelectTrigger` estilo pílula (badge colorida do `STATUS_META/PRIORITY_META`) sem largura fixa.
- Responsável/Conta/Projeto: reaproveita `AssigneePicker`/`ClientPicker`/`ProjectPicker` existentes com estilo mais discreto (borda transparente, hover `bg-muted/50`).

### 4. Descrição
- Movida para dentro do body, após os metadados. Label pequeno + `Textarea` sem borda, `focus:border` — sensação inline (Asana).

### 5. Discussão
- Header `💬 Discussão · N` com Separator acima.
- Lista de comentários mantém layout atual (avatar + bolha).
- **Composer stickado no rodapé** (acima do footer), com avatar do usuário atual à esquerda, textarea flat e botão Enviar redondo à direita — reduz peso visual do bloco atual.
- Menções (@) preservadas.

### 6. Footer
- Mantém "Excluir" (ghost destructive) à esquerda + timestamp "Criada em…" à direita, mas condensa para `py-2` para não competir com o composer.

## Fora do escopo
- Sem alterações em schema, RLS, ou server functions.
- Sem novos campos (Estimated time, Dependencies, Collaborators do Asana ficam para futuro).
- `CreateTaskDialog` (criação) permanece como está — refatoração recente.
- Navegação J/K, autosave, menções e `patchMutation` permanecem funcionalmente idênticos.

## Arquivos editados
- `src/components/tasks/shared.tsx` (linhas 664-929, apenas render do `TaskDrawer`).

## Validação
- Typecheck.
- Playwright: abrir tarefa existente, verificar top bar/metadados/discussão via screenshot, alterar status pelo botão "Concluir", confirmar autosave.
