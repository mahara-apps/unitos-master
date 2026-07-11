# Unificar /pipelines com o motor do Kanban de Conteúdo

Descartar o módulo CRM paralelo (`crm_*` + `CrmBoard` + `crm.functions.ts`) e transformar `/pipelines` em outra instância do MESMO motor já usado em `/content` (posts + `content_pipelines` + `content_pipeline_stages` + `ContentBoard`).

## O que muda

### 1. Rota `/pipelines` — reescrita
Reutiliza exatamente o padrão de `/content`:
- `usePageHeader` com switcher de pipeline + botão "Novo pipeline" (idêntico ao de conteúdo).
- `useSuspenseQuery` chamando `listPipelinesFn` / `ensureDefaultPipelineFn` / `loadBoardFn`.
- Render do `<ContentBoard />` já existente — mesmas lanes envelopadas, D&D, quick-add, renomear/recolorir/excluir coluna, dropdown, dialog de detalhe.
- Sub-bar com pílulas de **Ordenação** e **Intervalo** (as que hoje já existem no `pipelines.tsx`), aplicadas em cima dos posts antes de entregar ao board (ordenar por `created_at`, `scheduled_at`, título; filtrar por janela de datas).
- Empty states iguais aos do `/content` (sem workspace / sem conta).

### 2. Diferenciação por rota
Só o rótulo/copy do header muda; o motor é o mesmo:
- `/content` → título "Pipeline de conteúdo".
- `/pipelines` → título "Jornada", subtítulo "Fluxo visual do cliente" (livre pra editar as colunas).

Os pipelines seguem escopo por Workspace + Conta, exatamente como hoje em conteúdo. Cada rota lista todos os pipelines daquela conta — usuário pode criar quantos quiser em cada uma.

### 3. Limpeza (código morto)
- Remover `src/components/crm/crm-board.tsx`.
- Remover `src/lib/crm.functions.ts`.
- Remover imports/uso restantes de `ensureDefaultCrmPipelineFn`, `getCrmBoardFn`, `listCrmPipelinesFn`.

### 4. Limpeza de banco (migration)
Drop das tabelas CRM criadas na última rodada, pois deixam de ser usadas:
- `DROP TABLE public.crm_deals`
- `DROP TABLE public.crm_pipeline_stages`
- `DROP TABLE public.crm_pipelines`

Nenhuma outra tabela é tocada. `posts`, `content_pipelines` e `content_pipeline_stages` já suportam o cenário sem alterações.

## O que NÃO muda

- Sidebar: item "Jornada" continua apontando pra `/pipelines`.
- Motor de conteúdo (`content.functions.ts`, `ContentBoard`, `PostDetailDialog`) fica intacto.
- Sem campos financeiros/WhatsApp/avatar de contato — quem quiser esses campos vai por customização de coluna/post no motor de conteúdo depois.

## Resultado

Duas rotas (`/content` e `/pipelines`) compartilhando 100% do motor, D&D, filtros, ordenação, quick-add, dialog de detalhe, colunas customizáveis com cor e renomeação inline. Zero divergência de UX entre elas.
