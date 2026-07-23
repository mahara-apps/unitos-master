# Plano — Vincular posts do Kanban a `social_connections` reais

## Contexto atual (o que já existe)

- **TaskDialog** (`src/components/content/task-dialog.tsx`) já lista as contas do cliente via `listClientChannelAssignmentsFn` e mantém `state.targetConnectionIds: string[]` no formulário. Cada chip que hoje aparece em *"Vai publicar? Selecione a conta de destino"* já é uma **connection**, não um canal solto.
- Ao salvar, o dialog persiste `posts.channels` (array de strings do enum `post_channel`) **derivado** das connections selecionadas, e também escreve `posts.target_connection_ids` (array de UUIDs). Não escreve em `post_placements`.
- **Schedule Wizard** (`saveScheduledPostFn` em `src/lib/scheduling-wizard.functions.ts`) faz o oposto: apaga e reinsere linhas em `post_placements`, uma por `format`, colocando `connection_id` + `channel` dentro do jsonb `copy_override`. Também sincroniza `posts.channels` e `posts.target_connection_ids` como cache.
- Já existe `listClientSocialConnectionsFn` que retorna exatamente a mesma lista que o TaskDialog usa hoje (via wrapper próprio). Podemos padronizar em uma só.

## Objetivo

Fazer o Kanban editorial e o pipeline de publicação real falarem a mesma linguagem: `post_placements` como fonte de verdade do vínculo *(post → conexão, formato, override)*, e `posts.channels` rebaixado a cache de exibição.

---

## 1. UI do TaskDialog — seleção por conta específica

Estado atual já é "por conta". O que muda:

- Agrupar os chips em *"Vai publicar?"* por `channel` (Instagram, Facebook, LinkedIn…), com sub-chips por conta quando houver mais de uma da mesma rede. Hoje eles ficam soltos e ficam ambíguos quando o cliente tem duas contas IG.
- Ao lado de cada conta selecionada, um seletor compacto de **formato** (Feed / Reels / Stories…), reaproveitando a lista `FORMATS_BY_CHANNEL` que o Wizard usa. Isso é o par `(connection_id, format)` que vira uma linha em `post_placements`.
- Estado do form passa de `targetConnectionIds: string[]` para `destinations: { connectionId, channel, format, copyOverride? }[]` — mesma forma que `saveScheduledPostFn` já aceita. Sem `copyOverride` na v1; o campo fica reservado.
- Fonte única: consolidar `listClientChannelAssignmentsFn` e `listClientSocialConnectionsFn` em **uma só** função exportada por `scheduling-wizard.functions.ts` e consumida por ambos (Wizard e TaskDialog). Menos deriva, menos divergência.
- Empty state (nenhum canal vinculado) e o fallback atual de `blog`/`graphic` continuam iguais — esses dois não têm conexão real.

## 2. Persistência — `post_placements` vira fonte de verdade

`content.functions.ts` (`createPostFn` / `updatePostFn`) passa a:

1. Aceitar `destinations` no input, opcionais quando o post ainda é "ideia" sem canal definido.
2. Após upsert do `posts`, **replicar a sincronização de placements do Wizard**: `delete from post_placements where post_id = ?` + reinsert das linhas `(post_id, brand_id, client_id, format, copy_override: { connection_id, channel }, status: 'draft', is_primary)`. Reuso literal do bloco de `saveScheduledPostFn` linhas 398–434 — extrair para um helper `syncPostPlacements(supabase, { postId, brandId, clientId, destinations, scheduledIso?, action })` em `src/lib/placements.server.ts` e usar dos dois lados.
3. `posts.channels` e `posts.target_connection_ids` continuam sendo escritos, mas **derivados** de `destinations` — vira cache de exibição usado por filtros/legendas do Kanban e do painel `listApprovedUnscheduledFn`. Não é ponto de escrita direta em lugar nenhum.
4. Leitura: `getBoardFn` passa a hidratar cada `BoardPost` com as `placements` reais (mesma consulta que `listApprovedUnscheduledFn` já faz). Isso permite mostrar no card o chip da conta certa (`@marca_ig`) em vez de só *"instagram"*.

Depreciação de `posts.channels`:

- **Manter** como cache derivado por pelo menos um ciclo — muitos filtros da UI (`ChannelFilter`, badges do card, agregações do dashboard `channels-kpis`) usam `posts.channels` diretamente e o custo de trocar tudo em um único passo é alto.
- Marcar com comentário `// DERIVED: read from post_placements when available` nos pontos de escrita e abrir um follow-up para migrar leitores um a um.
- `target_connection_ids` fica igual (também derivado, também cache).

Nada de migração de dados: posts existentes sem `post_placements` continuam válidos e caem no path atual (leitura via `posts.channels`). Novos saves passam a materializar placements.

## 3. Botão "Aprovar e agendar" no TaskDialog

Hoje o botão *"Aprovar"* seta `review_status='approved'` e `stage='approved'`. Adicionar uma variante ao lado, habilitada só quando há pelo menos uma `destination` com formato agendável (`feed` em `instagram|facebook`, mesma regra do Wizard):

- Fluxo A — *sem sair do dialog*: ao clicar "Aprovar e agendar", abrir um sub-passo compacto no próprio dialog com um único campo `DateTimePicker` (mín. agora+5min, mesma validação de `saveScheduledPostFn`). Ao confirmar, chamar `saveScheduledPostFn` passando `postId` existente + `destinations` já materializadas. O saveFn faz o resto: valida conexões, cria linhas em `social_posts`, marca `stage='scheduled'`. Sem duplicar UI de wizard.
- Fluxo B — *delegar ao Wizard existente*: ao clicar, fechar o dialog e abrir o `ScheduleWizard` já pré-preenchido com `postId` (como o `PendingSchedulePanel` faz). Mais consistente com o resto do produto, mas quebra o fluxo do usuário (dois modais em sequência).

**Recomendação: Fluxo A.** Menor fricção, e como as `destinations` já estão persistidas em `post_placements` a partir do passo 2, `saveScheduledPostFn` recebe basicamente os mesmos dados que hoje monta a partir do Wizard — sem nova UI de destinos/mídia dentro do TaskDialog.

Se qualquer `destination` cair fora da regra de agendável, mostrar warning inline ("Reels/Stories ainda não são agendáveis — serão salvos como aprovados") e proceder só com os feeds válidos, exatamente o que `saveScheduledPostFn` já faz via `scheduleWarnings`.

## 4. Ordem de implementação sugerida

1. Extrair `syncPostPlacements` helper em `src/lib/placements.server.ts`; refatorar `saveScheduledPostFn` para usá-lo (sem mudança de comportamento — commit de base).
2. Consolidar as duas funções de listagem de conexões do cliente em uma só.
3. Trocar `state.targetConnectionIds` por `state.destinations` no TaskDialog; UI de chips por conta + seletor de formato ao lado.
4. `createPostFn` / `updatePostFn` recebem `destinations` e chamam `syncPostPlacements`. `posts.channels` continua sendo escrito como cache.
5. `getBoardFn` hidrata `placements` no `BoardPost`; card do Kanban mostra a conta (`@handle`) ao invés só do canal.
6. Botão "Aprovar e agendar" com sub-passo de datetime chamando `saveScheduledPostFn(postId=...)`.

## 5. Riscos / pontos de atenção

- **`UNIQUE(post_id, format)` em `post_placements`**: já cai no path do Wizard. Se o usuário escolher duas contas Instagram + mesmo format `feed`, só uma linha sobrevive (última vence). Alertar visualmente no dialog e/ou permitir só uma conta por `(channel, format)` até relaxarmos a constraint.
- **Cache stale**: `posts.channels` derivado pode divergir se algum caminho antigo escrever direto. Auditar `updatePostFn` e movePostFn para confirmar que só o novo helper escreve `channels`.
- **Backfill opcional (não obrigatório na v1)**: gerar `post_placements` para posts existentes com `channels` populado e sem placements, um por `(channel, 'feed')` sem `connection_id`. Deixar como job separado, fora deste plano.
- **RLS de `post_placements`**: já existe (usada pelo Wizard); nada novo.

Sem alterações de schema. Sem edge functions. Sem novas dependências.
