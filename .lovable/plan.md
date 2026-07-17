## Objetivo

Padronizar toda a experiência do módulo `/tasks` em torno do **drawer lateral** (Sheet 640px) já usado como padrão do sistema, eliminando o modal central de criação e permitindo abrir qualquer tarefa em **1 clique** — sem depender de acertar o título.

## Diagnóstico atual (verificado)

- `src/components/tasks/shared.tsx` → `CreateTaskDialog` usa `Dialog` centralizado (linhas 421-503), fora do padrão dos demais drawers do sistema (Novo cliente, Adicionar membro, TaskDrawer).
- `TaskDrawer` (linhas 664-930) já é um Sheet 640px, mas o header mistura `Input` cru + `Select` cru + `<input type="datetime-local">` nativo, quebrando a linguagem visual (badges semânticas, chips, tokens do DS) usada na tabela/kanban.
- Abertura da tarefa hoje só acontece ao clicar no **botão do título** (`task-table.tsx:475` `<button onClick={onOpen}>`) — o resto da linha não é clicável. No Kanban o card inteiro já abre (`task-kanban.tsx:63`).
- Rota `tasks.tsx` orquestra `CreateTaskDialog` + `TaskDrawer` via `?taskId=` na URL — permanece igual.

## Plano

### 1. Substituir o modal "Nova tarefa" por drawer lateral

Refatorar `CreateTaskDialog` em `shared.tsx` para `CreateTaskDrawer` (mantendo o nome exportado por compat) usando `Sheet` + `SheetContent` 520px, mesma estrutura de `add-member-drawer.tsx` / `quick-create-customer-drawer.tsx`:

- Header do Sheet com título "Nova tarefa" + subtítulo curto.
- Body com os mesmos campos (Título, Descrição, Prioridade, Prazo, Responsável, Conta, Projeto) em espaçamento vertical do DS (`space-y-4`), labels `text-xs font-medium text-muted-foreground`.
- Footer fixo com "Cancelar" + "Criar tarefa" (primary).
- Preserva a API `{ brandId, clientId, open, onOpenChange, onCreated }` — nenhuma mudança em `tasks.tsx`.

### 2. Alinhar o `TaskDrawer` ao design system do módulo

Ajustes visuais em `shared.tsx` (não muda API):

- Trocar o `<Select>` de status pelo `TaskStatusBadge` clicável (Popover com opções), reaproveitando `STATUS_META` — igual às pílulas usadas na tabela.
- Trocar o `<Select>` de prioridade pelo `TaskPriorityBadge` clicável (mesmo Popover pattern).
- Trocar o `<input type="datetime-local">` bruto por um botão outline `h-7 text-xs` com ícone `CalendarClock` + label formatado (`d 'de' MMM · HH:mm`) abrindo `Popover` com input datetime-local — casa com o visual dos chips do header.
- Uniformizar spacing (`px-6 py-4` → `p-5`), separadores, e usar `Separator` do DS entre seções (Descrição / Metadados / Discussão).
- Manter navegação J/K, autosave onBlur, comentários com @menções.

### 3. Abrir tarefas em 1 clique (linha inteira clicável)

Em `src/components/tasks/task-table.tsx`:

- Adicionar `onClick={() => onOpenTask(task.id)}` + `className="cursor-pointer hover:bg-muted/40"` na `<tr>` da `TaskRow`.
- Manter `e.stopPropagation()` nas células interativas (checkbox de seleção, botão de "concluído", pickers inline de status/prioridade/responsável, menu `...`) para não disparar o abrir junto — o padrão `<td onClick={(e) => e.stopPropagation()}>` já existe em `task-table.tsx:457` e será replicado nas demais.
- Remover o wrapper `<button onClick={onOpen}>` do título, deixando só o texto (o clique já vem da linha).
- Em `task-calendar.tsx`, os chips já abrem no clique — sem mudança.
- Em `task-kanban.tsx`, cards já abrem no clique — sem mudança.

### 4. Validação

- Typecheck (`tsgo`).
- Playwright headless em `/tasks`: criar tarefa via drawer, clicar em qualquer célula da linha para abrir, mudar status pela pílula no header, screenshot final.

## Detalhes técnicos

- Arquivos tocados: `src/components/tasks/shared.tsx`, `src/components/tasks/task-table.tsx`.
- Nenhuma mudança em `tasks.functions.ts`, RLS, ou schema.
- Nenhuma mudança na URL/search params da rota `/tasks`.
- Exports públicos preservados: `CreateTaskDialog` (alias para o novo drawer) e `TaskDrawer`.
