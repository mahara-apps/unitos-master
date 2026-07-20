## Diagnóstico

O timesheet **existe** e persiste em `task_time_entries`, mas hoje só é acessível em `/projects/$projectId` (dentro do `JobsPanel`, botão Play em cada tarefa abre `TaskTimesheetSheet`). Nos drawers de tarefa usados em `/content` e `/tarefas` (`task-dialog.tsx`) não há nenhum ponto de entrada — por isso "não se encontra no front". Além disso, o controle atual tem apenas **Iniciar/Parar**, sem Pause.

## Objetivos

1. Tornar o timesheet acessível a partir do drawer principal de tarefa (usado em `/content` e `/tarefas`), mantendo também o acesso atual em `/projects`.
2. Trocar o par Iniciar/Parar por **Play · Pause · Stop** com "pausa acumulando" (cada retomada = novo segmento em `task_time_entries`; o total continua sendo a soma dos segmentos).
3. Manter apontamento manual, estimativa e histórico já existentes intactos.

## Escopo por arquivo

- `src/components/projects/task-timesheet-sheet.tsx`
  - Substituir o bloco "Timer" por três botões: **Play** (start), **Pause** (stop server-side + marca `paused=true` no estado local), **Stop** (stop server-side + limpa estado `paused`).
  - Enquanto `paused`, mostrar badge "Pausado" e o botão principal vira Play (retomar). Total exibido = soma dos segmentos já salvos (comportamento atual do `useMemo`).
  - Persistir o flag `paused` por tarefa em `localStorage` (`unitos.timesheet.paused.<taskId>`) para sobreviver a refresh; ao dar Stop, remove-se a chave.
  - Nada muda em server functions / SQL — Pause reutiliza `stopTimerFn`, Play reutiliza `startTimerFn`. "Pausa acumulando" já é natural: cada segmento vira uma linha em `task_time_entries` e `total_minutes` soma tudo.

- `src/components/content/task-dialog.tsx` (drawer principal de tarefa em /content e /tarefas)
  - Adicionar seção compacta "Timesheet" (ou uma aba, seguindo o padrão do drawer) que renderiza o mesmo widget de Play/Pause/Stop + total `HH:MM / estimativa` + link "Ver histórico" que abre o `TaskTimesheetSheet` já existente (reaproveitando componente).
  - Ler `brandId` do contexto ativo; usar `task.id` do drawer.
  - Ocultar quando a tarefa ainda não estiver persistida (sem `id`).

- `src/components/projects/jobs-panel.tsx`
  - Sem mudança funcional; permanece abrindo o mesmo sheet.

## Comportamento do Pause (acumulando)

```text
Play   → startTimerFn (nova row aberta em task_time_entries)
Pause  → stopTimerFn (fecha row, grava minutos)  + paused=true (local)
Play   → startTimerFn (nova row) — segmento adicional
Stop   → stopTimerFn (se estiver rodando) + paused=false (local)
Total  → soma de minutes das rows (já implementado)
```

Não requer migração de schema — o modelo atual já suporta múltiplos segmentos por tarefa/usuário.

## Fora de escopo

- Widget global flutuante (usuário optou por manter dentro do drawer).
- Mudanças em RLS/RPC (`start_timer`/`stop_timer` continuam como estão).
- Redesign visual do popover da imagem enviada (a imagem foi usada como referência de intenção — Play/Pause/Stop —, não como layout final).

## Validação

- Abrir uma tarefa em `/content` → clicar Play, Pause, Play, Stop → conferir que o histórico mostra 2 segmentos e o total soma corretamente.
- Repetir em `/projects/$projectId` para garantir paridade.
- Refresh durante estado "pausado" deve manter a UI em Pausado (via localStorage).
