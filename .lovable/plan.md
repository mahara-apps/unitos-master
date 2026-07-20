## Objetivo

Todo conteúdo — manual, quick-add no board, ou gerado por IA (plano mensal) — precisa nascer com um **responsável** já atribuído. Adicionar seleção explícita na criação manual/IA e fallback determinístico (usuário atual) quando não escolhido.

## Situação atual (verificada)

- `task-dialog.tsx` já tem `AssigneeSelect`, mas o estado inicial é `assigneeId: null` — o usuário precisa lembrar de escolher.
- Quick-add no `content-board.tsx` (`addPost`) só envia `title` — sem responsável.
- `generate-plan-dialog.tsx` (Gerar plano por IA) não coleta responsável.
- `POST /api/jobs/monthly-plan` insere posts em `posts` sem `assignee_id`/`assignees` (linhas ~409-434 de `src/routes/api/jobs/monthly-plan.ts`).
- `createPostFn` (`src/lib/content.functions.ts`) já tem fallback para o **owner** da marca quando nenhum assignee é passado, mas isso raramente é o operador correto.

## Mudanças

### 1. `src/components/content/task-dialog.tsx` (criação manual)
- Ao abrir em modo criação, pré-selecionar `assigneeId` com o usuário atual (`supabase.auth.getUser()` já disponível via hook existente) em vez de `null`.
- Manter o `AssigneeSelect` visível e obrigatório no bloco do topo (já é).

### 2. `src/components/content/content-board.tsx` (quick-add coluna)
- Passar `assignees: [currentUserId]` no `createPost` do quick-add para o responsável não ficar em branco.

### 3. `src/components/calendar/generate-plan-dialog.tsx` (IA)
- Adicionar campo **"Responsável padrão"** (Select com membros da marca via `listBrandAssigneesFn`, default = usuário atual).
- Enviar `assigneeId` no body do `POST /api/jobs/monthly-plan`.

### 4. `src/routes/api/jobs/monthly-plan.ts` (backend do plano IA)
- Estender `BodySchema` com `assigneeId: z.string().uuid().optional()`.
- Ao montar `rows` (linha ~415), incluir:
  - `assignee_id: input.assigneeId ?? userId`
  - `assignees: [input.assigneeId ?? userId]`
- Assim, mesmo se o front não mandar, o dono da execução vira responsável (garantia zero-post-órfão).

### 5. Fallback global em `createPostFn` (`src/lib/content.functions.ts`)
- Trocar o fallback atual (owner da marca) por: **usuário chamador (`userId` do middleware)**, mantendo o owner apenas como último recurso. Assim posts criados por qualquer via já pertencem a quem operou.

## Fora de escopo

- Notificação automática ao responsável recém-atribuído (já existe fluxo de bell em outros pontos; podemos abordar depois se necessário).
- Regras de balanceamento/round-robin entre membros na geração por IA (o pedido é apenas atribuir — round-robin fica para próxima iteração).
