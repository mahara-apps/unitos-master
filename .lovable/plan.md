## Objetivo
Fazer o "Plano do Mês" respeitar automaticamente a **Volumetria semanal por canal** definida no Briefing (aba Volumetria & Metas), em vez de pedir um número genérico de peças.

## Mudanças

### 1. `src/components/customer/monthly-plan-dialog.tsx`
- Carregar `clients.brand_hub.volumetry` (via `useQuery` no `brand-hub.functions`) para o `clientId`.
- Calcular automaticamente: `pecasPorMes = Σ (volumetry[canal] * 4.33 semanas)` arredondado.
- Substituir o input "Peças por mês" por um **breakdown read-only por canal**:
  ```
  Instagram   20/sem → 87/mês
  TikTok       8/sem → 35/mês
  LinkedIn     4/sem → 17/mês
  ─────────────────────────────
  Total: 139 peças/mês  ·  Multiplicado por N meses = X
  ```
- Manter o seletor "Quantidade de meses" (1–6).
- Se a volumetria estiver zerada, exibir alerta com link para `/customers/$id/briefing` e desabilitar o botão.
- Permitir um toggle "Ajustar manualmente" que reabre o input numérico (fallback), preservando a UX atual como escape.

### 2. `src/routes/api/jobs/monthly-plan.ts`
- Estender o `BodySchema` com um campo opcional `channelMix: Record<channel, number>` (peças por canal no período total).
- Passar esse mix ao **planner_strategic** via novas variáveis de template: `{{CHANNEL_MIX}}` e `{{TOTAL_PECAS}}`.
- Ao inserir posts, respeitar a distribuição: se o planner retornar plataforma diferente da cota, forçar `channels` do primeiro canal com cota restante (round-robin por cota).
- Fallback: se `channelMix` ausente, comportamento atual (quantidade × período).

### 3. `agent_prompts` (planner_strategic)
- Atualizar o system prompt (via `supabase--migration`) para instruir explicitamente:
  > "Distribua os N conceitos respeitando a cota por canal em CHANNEL_MIX. Não gere mais peças por plataforma do que o cota indica."

### 4. Sem alterações em
- Schema do banco (a volumetria já vive em `clients.brand_hub.volumetry`).
- Pipeline/stages/posts insert logic (só o preenchimento de `channels` muda).

## Resultado
O usuário abre "Gerar Plano do Mês", vê o volume derivado do briefing, escolhe apenas quantos meses gerar, e o pipeline recebe as peças na proporção correta por canal.
