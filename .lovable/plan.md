## Diagnóstico

Verifiquei o banco: **as 3 pautas foram sim persistidas** em `monthly_plans` (2 draft + 1 archived, todas do seu brand). O problema não é gravação, são três lacunas de produto:

1. **Sem histórico visível.** A tela inicial ("Sobre o que vamos falar este mês?") só mostra a pauta que acabou de ser gerada via `planId` em `useState`. Ao dar F5 ou trocar de tela, o estado local zera e a pauta some da UI, dando a sensação de que "não salvou".
2. **Sem escopo por cliente.** A tabela `monthly_plans` só tem `brand_id`. Se o workspace tiver vários clientes, todos compartilham o mesmo histórico — e hoje não conseguimos filtrar por cliente porque o campo não existe.
3. **Volumetria semanal ignorada.** O prompt hardcoda "8 a 12 tópicos". O valor de `clients.brand_hub.volumetry` (posts/semana por canal — Instagram, TikTok, LinkedIn, YouTube, Facebook) definido no Briefing nunca é lido pela geração.

## O que vamos entregar

1. Escopar `monthly_plans` por cliente e liberar histórico por cliente com autor e data.
2. Fazer a IA respeitar a volumetria semanal do cliente (posts/semana × ~4,3 semanas do mês), distribuindo por canal.
3. Refazer a tela inicial da Pauta com um bloco "Histórico" para abrir pautas anteriores.

## Alterações técnicas

**Migration (schema)**
- `ALTER TABLE monthly_plans ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE CASCADE`.
- Backfill: para os 3 registros existentes, associar ao 1º cliente do respectivo brand (ou arquivar se ambíguo).
- `ALTER COLUMN client_id SET NOT NULL` + `CREATE INDEX ON monthly_plans (brand_id, client_id, created_at DESC)`.
- Ajustar RLS de `monthly_plans` e `monthly_plan_topics` para exigir membership no cliente (padrão já usado em briefings).

**`src/lib/monthly-plans.functions.ts`**
- `generateMonthlyPlanFn`:
  - carregar `clients.brand_hub.volumetry` do cliente ativo;
  - calcular `total = round(sum(volumetria semanal) * 4.3)` e cota por canal;
  - prompt passa a incluir a distribuição alvo por canal e obriga o campo `channel` em cada tópico (`instagram | tiktok | linkedin | youtube | facebook`);
  - fallback: se `sum = 0`, mantém 8–12 (comportamento atual) e não força canal;
  - insere `client_id` no `INSERT` de `monthly_plans`.
- `AiPlanSchema.topics`: adicionar `channel` (enum) e permitir até `max(total, 40)` itens.
- `monthly_plan_topics`: adicionar coluna `channel text` (nullable) na migration para carregar o valor.
- Nova função `listMonthlyPlansFn({ brandId, clientId })` — retorna `id, title, status, created_at, created_by, author_name` (join com `user_profiles`) ordenado por `created_at DESC`.
- `getMonthlyPlanFn` já funciona; adicionar `client_id` no retorno.

**UI `src/routes/_authenticated/customers.$customerId.pauta.tsx`**
- Passa `clientId` no `generate`.
- No estado inicial (sem `planId`), abaixo do formulário adicionar seção **"Histórico de pautas deste cliente"**:
  - tabela enxuta: título, status (badge), autor, data (pt-BR), botão "Abrir".
  - clicar seta `planId` e reaproveita o `ApprovalView`.
  - inclui a pauta recém-gerada automaticamente após invalidar `["monthly-plans", brandId, clientId]`.
- Se a URL trouxer `?planId=...`, restaurar o estado (para permitir F5 sem perder contexto).
- Após geração e aprovação/descarte, `queryClient.invalidateQueries` da lista.

**Sem mudanças**: aprovação → Kanban, edição de tópicos, descarte.

## Fora do escopo (agora)

- Regeneração parcial de tópicos por canal.
- Editor visual de volumetria dentro da Pauta (segue no Briefing).
- Migração retroativa dos tópicos antigos para novo campo `channel` (ficam null; UI mostra "—").

Depois de aprovar eu implemento em uma leva só (migration + backend + UI).
