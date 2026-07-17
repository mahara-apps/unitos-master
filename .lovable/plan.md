
## Diagnóstico

Verifiquei o estado atual:

- `src/router.tsx` já tem `defaultPreload: "intent"`, `defaultPreloadDelay: 50` e `defaultPreloadStaleTime: 0`. ✅
- A sidebar (`src/components/app-sidebar.tsx`) usa `<Link>` do TanStack — herda o preload. ✅
- **Gargalo real:** apenas `customers.$customerId.tsx` define `loader` com prefetch. Todas as outras rotas (`dashboard`, `content`, `calendar`, `tasks`, `projects`, `analytics`, `connections`, `notifications`, `customers`, `media-plans`, `brain`, `agents`, `settings.*`) buscam dados só depois do componente montar via `useQuery`. Resultado: o hover pré-carrega apenas o chunk JS, mas a página ainda mostra skeleton enquanto o fetch começa **após** o clique.
- Abas internas (Radix `Tabs` em `customers/$id`, `connections`, `settings`) não são rotas — não há preload nativo. O painel só busca dados quando você clica.

## O que vou fazer

### 1) Ajuste global do router (`src/router.tsx`)

- `defaultPreloadDelay: 50 → 0` — dispara o prefetch imediatamente no hover, sem 50ms de espera.
- Manter `defaultPreloadStaleTime: 0` (Query controla o TTL).

### 2) Adicionar `loader` com prefetch nas rotas quentes

Padrão canônico TanStack + Query — não bloqueia navegação, só aquece cache:

```ts
loader: ({ context }) => {
  context.queryClient.prefetchQuery(dashboardKpisQuery(brandId));
  context.queryClient.prefetchQuery(dashboardHeatmapQuery(brandId));
}
```

Rotas alvo (uma `queryOptions` factory por consulta principal, reutilizada por loader e componente):

| Rota | Consultas pré-buscadas |
|---|---|
| `dashboard` | KPIs, heatmap, pipeline, próximos posts |
| `customers.index` | lista de clientes + counts |
| `content` | posts do board + pipeline stages |
| `calendar` | posts do mês vigente |
| `tasks` | tasks do usuário + KPIs |
| `projects.index` | lista de projetos |
| `projects.$projectId` | projeto + posts vinculados |
| `analytics` | métricas do período padrão |
| `connections` | conexões + KPIs (IA/canais/mensageria) |
| `notifications` | inbox + KPIs |
| `media-plans` | lista de planos |
| `customers.$customerId.brain` | briefing + personas + swot |
| `settings.team` | membros + convites |
| `settings.notifications` | preferências |

Para rotas sob `_authenticated`, o loader roda com o middleware Supabase já em contexto — sessão garantida, sem risco de 401 em prerender.

### 3) Sidebar — `preload="intent"` explícito

Em `src/components/app-sidebar.tsx`, adicionar `preload="intent"` em cada `<Link>` para deixar o comportamento evidente e imune a futuras mudanças de `defaultPreload`.

### 4) Prefetch em abas Radix (in-page)

Criar util `useTabPrefetch(queryOptions)` e passar `onMouseEnter`/`onFocus` nos `TabsTrigger` das telas com tabs pesadas:

- `customers.$customerId.tsx` — aba **Cérebro da Marca**, **Produção**, **Cadastro**
- `connections.tsx` — abas **Canais** e **Mensageria** (KPIs pesados)
- `settings.tsx` — abas menos críticas ficam de fora

O hover na aba dispara `queryClient.prefetchQuery(...)` sem trocar de tab; ao clicar, o painel já tem dado quente.

### 5) Sem alterações comportamentais

- Nenhuma mudança de UI, layout ou lógica de negócio.
- Nenhuma migração de banco.
- Nenhuma refatoração de componentes — só adiciono `loader`, factory `queryOptions()`, e handlers `onMouseEnter` em triggers.

## Impacto esperado

- **Sidebar:** clique após hover ≥ ~100ms passa a ser praticamente instantâneo (chunk + dados já em cache).
- **Abas internas:** troca de aba sem skeleton na maioria dos casos.
- **Custo:** prefetch em hover consome um pouco mais de banda; mitigado pelo `staleTime` do Query (dados reaproveitados) e por `prefetchQuery` (não bloqueia, não dispara refetch se já fresco).

## Detalhes técnicos

- Cada rota que hoje só usa `useQuery` ganha uma `queryOptions()` factory exportada em `src/lib/<feature>.queries.ts` (ou junto do arquivo de server functions).
- O componente continua usando `useQuery(opts)` — nenhuma mudança de render.
- O loader chama `context.queryClient.prefetchQuery(opts)` (sem `await`) para não bloquear a navegação; se o dado já estiver fresco, Query devolve do cache.
- Nada muda em `Suspense` boundaries existentes.
