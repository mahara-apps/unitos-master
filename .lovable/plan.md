## Objetivo

Reduzir a poluição visual em `/connections` separando os 3 blocos atuais em **tabs** no topo da página, mantendo os KPIs globais visíveis acima das tabs.

## Estrutura proposta

```text
[ Header via usePageHeader — "Conexões" + status pill ]

[ KPI Row — 4 KpiCards ] (permanece global, fora das tabs)
  Consumo mês (USD) | Teto mensal (USD) | Tokens do mês | Sucesso/Chamadas

[ Tabs — variant "bordered" (mesmo padrão de customers/settings) ]
  ┌─ IA  ─ Canais ─ Mensageria ─┐

  [Tab: IA]
    Sub-row: LeaderPicker texto | LeaderPicker imagem | Input teto mensal
    Grid 1/2/3 de ProviderCards (OpenAI, Anthropic, Gemini)

  [Tab: Canais]
    Grid 1/2/4 de ChannelCards (Instagram, TikTok, Facebook, YouTube)

  [Tab: Mensageria]
    Grid 1/3 de MessagingCards (WhatsApp Evolution, WhatsApp Cloud, Resend)
```

## Escopo técnico

- **Arquivo alterado (único):** `src/routes/_authenticated/connections.tsx`.
- Envolver os 3 `DashboardPanelSurface` existentes em `<Tabs>` (`@/components/ui/tabs`, variant `bordered`) com `TabsList` / `TabsTrigger` / `TabsContent`.
- Manter `KpiRow` acima das tabs (contexto global).
- Manter estado da tab ativa em `useState` local (default: `"ai"`); não persistir em URL neste passo.
- Sem mudanças em `connections.functions.ts`, sem mudanças de dados, sem novas dependências.

## Fora de escopo

- Nenhuma alteração de backend/schema.
- Nenhum novo bloco/card; apenas reorganização visual.
- Não sincronizar tab com querystring (pode ser um passo futuro se pedido).

## Verificação

1. Build limpo.
2. `/connections`: KPIs no topo, 3 tabs funcionais, cada uma mostrando apenas seu bloco.
3. Dark/light OK, sem cores hardcoded.
