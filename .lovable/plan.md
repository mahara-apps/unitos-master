# Visão unificada de Conteúdos — modo "Todos os clientes"

Hoje `/content` só mostra o Kanban/Lista do cliente ativo. O gestor precisa alternar cliente por cliente para identificar gargalos e atrasos. Este plano adiciona uma **visão cross-client** dentro do próprio módulo Conteúdos, reaproveitando o Kanban/Lista existentes e o motor de SLA — sem migração de banco.

## O que muda na tela

Ao entrar em `/content` sem cliente ativo (modo Agência), a página passa a renderizar a **Visão unificada** ao invés do estado vazio atual:

1. **Header operacional** (barra fina no topo):
   - KPIs compactos: total em produção, aguardando aprovação, atrasadas, at-risk, clientes parados (>N dias sem movimento).
   - `DateRangePicker` já existente + toggle Kanban/Lista + botão "Filtros".

2. **Filtros no popover "Filtros"** (mesmo componente já criado):
   - Multi-select de **Clientes** (default: todos permitidos).
   - Multi-select de **Etapas**, **Responsáveis**, **Status SLA** (on_track / at_risk / overdue), **Redes**, **Formatos**.
   - "Somente clientes parados há mais de X dias" (slider).

3. **Kanban unificado** (default):
   - Colunas = etapas canônicas (agrupamento por `label` normalizado, já que cada cliente pode ter seu próprio pipeline). Cards mostram **badge do cliente** (avatar + nome) além do conteúdo padrão.
   - Drag & drop **desabilitado** nesta visão (evita mover post entre pipelines de clientes distintos); clique no card abre o drawer normal.
   - Chip de SLA reaproveita o tooltip corrigido recentemente.

4. **Lista unificada** (alternativa):
   - Colunas: Cliente, Título, Etapa, Responsável, SLA, Última atividade, Ações.
   - Ordenável por SLA/última atividade; ideal para triagem rápida.

5. **Painel lateral "Clientes parados"** (colapsável à direita):
   - Lista clientes cujo post mais recente em produção não mudou de etapa há > 3 dias, com contagem e link "Abrir cliente".

## Regras de acesso

- Visível **apenas para `admin`** da brand (via `useAccessRole()`), incluindo `super_admin`. Para `user`, `/content` continua exigindo cliente ativo, como hoje.
- Se um `admin` estiver no modo Cliente, `/content` continua idêntico ao atual (Kanban do cliente).
- Todos os dados respeitam `brand_id` e RLS. Filtro de clientes respeita `allowedClientIds` (irrelevante para admin, mas mantém a arquitetura consistente).

## Detalhes técnicos

**Backend** — nova server function `listAgencyContentFn({ brandId, range, filters })` em `src/lib/content.functions.ts` (reaproveitando helpers já existentes: `stageSlaHours`, `annotateOverdue`):

```ts
{
  posts: Array<PostRow & { client_name, client_avatar, stage_label, sla_status }>;
  stagesByLabel: Array<{ label: string; color: string|null; count: number }>;
  kpis: { inProduction, awaitingApproval, overdue, atRisk, stalledClients };
  stalledClients: Array<{ client_id, client_name, last_move_at, count }>;
}
```

Uma query única em `posts` (filtrada por `brand_id`, `deleted_at IS NULL`, etapa não-terminal), joins com `clients`, `content_pipeline_stages` e `user_profiles` do responsável. Agregações no server para o painel de "clientes parados".

**Frontend** — nova view `src/components/content/agency-content-view.tsx`:
- Reaproveita `ContentBoard` e `ContentList` via props (`readOnlyDnd`, `showClientBadge`, `groupBy: "stageLabel"`).
- Renderizada por `src/routes/_authenticated/content.tsx` quando `!clientId && role === "admin"`.
- `useSuspenseQuery` com `queryKey: ["agency-content", brandId, range, filters]`.

**UI existente adaptada** — `ContentCard` ganha prop opcional `client` para renderizar o mini-badge (avatar 16px + nome truncado) no rodapé, sem alterar o card do modo Cliente.

**Sem migração de banco.** Todas as colunas necessárias já existem em `posts`, `content_pipeline_stages`, `clients` e `user_profiles`.

## Fora do escopo

- Não altera o Kanban do modo Cliente.
- Não permite drag & drop cross-client (evita mover posts entre pipelines diferentes).
- Não substitui a seção "Operação da agência" do Dashboard — são visões complementares (dashboard = KPIs; conteúdos = operação detalhada).
- Não cria pipeline global normalizado; agrupamento é feito por `label` em runtime.
