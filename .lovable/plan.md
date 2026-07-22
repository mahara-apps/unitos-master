# Ritmo de publicações — corrigir fonte de dados

## Diagnóstico (confirmado)

O card "Ritmo de publicações" (agência e conta) e o sparkline de "Publicações aprovadas · 30d" leem exclusivamente `posts.published_at`. Na base atual:

- `posts` total: **127** · com `published_at`: **3** (últimos 14d: **2**)
- `social_posts` total: **0** · com `status='published'`: **0**

Ou seja, hoje só o fluxo "Publicar agora" do wizard grava `posts.published_at`. Todo agendamento processado pelo worker (`publish-scheduled`) grava em `social_posts` (status/published_at por placement), e por isso o gráfico fica sempre próximo de zero — mesmo quando há publicações reais.

Arquivos-fonte:
- `src/lib/dashboard.functions.ts` → `computeStats` (linhas 383–402, conta) e `computeAgency` (linhas 850–867, agência).
- `src/routes/_authenticated/dashboard.tsx` → `PublishTrendCard` consome `publishTrend14d` + `topChannels`/`channelCounts`.

## O que fazer

Unificar a fonte de "publicações realizadas" em ambos os modos, sem mexer na UI:

1. **`computeAgency` (agência):**
   - Buscar `social_posts` do brand (`published_at, platform, client_id`) com `status='published'` e `published_at >= now-14d`, escopado pelos `client_id` do brand.
   - Compor `publishTrend14d` por dia como `UNION` de duas séries: um evento por `posts.published_at` **e** um evento por linha de `social_posts` publicada. Deduplicar por `(post_id, platform, dia)` quando `social_posts.post_id` estiver setado, para não contar duas vezes o mesmo placement.
   - `topChannels`: somar `posts.channels[]` (legado) + `social_posts.platform` (fonte de verdade quando existir), mantendo o mesmo shape `{ channel, count }`.
   - `avgLeadTimeDays`: manter `posts.created_at → posts.published_at` (fórmula canônica atual); adicionar fallback para usar `min(social_posts.published_at)` do post quando `posts.published_at` for null, para não subestimar o lead time.

2. **`computeStats` (conta):**
   - Mesmo tratamento, escopado por `client_id` ativo.
   - `channelCounts` idem (union `posts.channels` + `social_posts.platform`).

3. **Sparkline do KPI "Publicações aprovadas · 30d":**
   - Continua vindo de `publishTrend14d`, agora consistente com o card. Sem alteração no componente.

4. **Sem migrações.** Somente leitura adicional a `social_posts` (já com RLS por brand). Sem mudança de tipos exportados — o shape `publishTrend14d: number[]` e `topChannels: {channel,count}[]` permanece.

## Verificação

- Rodar a query de sanidade novamente após o deploy: contagem por dia dos últimos 14d deve refletir `posts.published_at ∪ social_posts.published_at` (dedupe por placement).
- Abrir Dashboard agência e Dashboard de uma conta com posts publicados via agendamento — o gráfico e o KPI devem apresentar barras não-zero condizentes.

## Fora de escopo

- Não mexer em `PublishTrendCard` (UI), no filtro de data range do header, nem na regra de `posts_approved_30d`.
- Não alterar o worker `publish-scheduled` nem o fluxo "Publicar agora".
