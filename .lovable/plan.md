## Ajustes na tela do Cliente

**Arquivos afetados**
- `src/routes/_authenticated/customers.$customerId.tsx` — reordenar/remover abas
- `src/components/customer/customer-dashboard.tsx` — gate do botão "Gerar Plano do Mês"
- `src/components/customer/monthly-plan-dialog.tsx` — aceitar prop `disabled` + tooltip
- `src/components/brand-hub/briefing-workspace.tsx` — expor `computeCompletion` (ou replicar cálculo de progresso via query)

### 1. Reordenar abas e remover Tópicos

Nova ordem em `TABS`:
```
Visão geral · Dados básicos · Briefing · Estratégia · Público · Mercado
```
- Remover a entrada `topics` (`TopicsTab`) e o respectivo `<TabsContent value="topics">`.
- Remover imports não utilizados (`TopicsTab`, `TopicsSkeleton`, `customerPautasQuery` do prefetch caso não seja mais usado em nenhuma outra aba — manter se `StrategyTab`/`MarketTab` dependerem dele).
- Mover `<TabsContent value="briefing">` para logo após `basic`.

### 2. Gate de geração de conteúdo pelo Briefing

Regra: só liberar "Gerar Plano do Mês" (e o pipeline de conteúdo derivado do briefing) quando o briefing estiver **100% preenchido**.

Implementação:
- Exportar a função `computeCompletion` de `briefing-workspace.tsx` (ou mover para `src/lib/briefing-progress.ts`) para ser reutilizada no dashboard do cliente.
- No `CustomerDashboard`, ler o hub via `getBrandHub` (query já cacheada pelo Briefing) e calcular `completion`.
- Passar `disabled={completion < 100}` para `MonthlyPlanDialog` e um `reason` textual.

Em `monthly-plan-dialog.tsx`:
- Aceitar props `disabled?: boolean` e `disabledReason?: string`.
- Quando `disabled`, o botão principal fica desabilitado, com tooltip:
  > "Complete 100% do briefing para liberar a geração de conteúdo."
- Adicionar um badge/hint no card do dashboard mostrando `Briefing 62% — complete para liberar` com link direto para a aba Briefing.

### 3. Fluxo pós-liberação (já existente, apenas confirmado)

O endpoint `/api/jobs/monthly-plan` continua sendo o motor:
- Usa os agentes atuais (temas, headlines, ganchos) cruzando **todo o briefing** (`brand_hub` + `voice` + volumetria).
- Cria posts no `posts` com `pipeline_id` padrão → aparecem automaticamente no **Kanban de Produção** e no **Calendário** (o Calendar já lê da mesma tabela).
- Nenhuma mudança de schema necessária.

### Fora de escopo
- Não mexer no motor de agentes nem em RLS.
- Não alterar o layout do header do cliente (KPIs, botões Regenerate/Pipeline).