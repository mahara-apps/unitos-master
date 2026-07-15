
## Objetivo

Refatorar `src/routes/_authenticated/connections.tsx` para o mesmo padrão visual das telas já refatoradas (Produção, Calendário, Customers), usando `DashboardPageShell`, `KpiCard` e `DashboardPanelSurface`, e reorganizar o conteúdo em 3 blocos conforme solicitado.

## Estrutura de UI

```text
[ Header via usePageHeader — "Conexões" + status pill ]

[ KPI Row — 4 KpiCards ]
  Consumo mês (USD)  |  Teto mensal (USD)  |  Tokens do mês  |  Sucesso/Chamadas

[ Bloco 1 — Inteligências Artificiais ]
  SectionHeader "ai foundations"
  Sub-row: LeaderPicker texto ativo | LeaderPicker imagem ativa | Input teto mensal
  Grid 1/2/3 cols de ProviderCards (OpenAI, Anthropic, Gemini)
    Cada card: header (logo+nome+status) · Model select (por provider) ·
               API key mascarada · MicroStats (tokens no mês, custo estimado no mês) ·
               Ações Conectar / Rotacionar / Remover

[ Bloco 2 — Canais Sociais ]
  SectionHeader "social channels"
  Grid 1/2/4 de ChannelCards: Instagram, TikTok, Facebook, YouTube
    Card: ícone da rede colorido · handle · status · Conectar/Editar/Remover

[ Bloco 3 — Mensageria & Comunicação ]
  SectionHeader "messaging & delivery"
  Grid 1/3 de MessagingCards:
    - WhatsApp Evolution (base URL + instance + apiKey)
    - WhatsApp Cloud API (phone number id + access token)
    - Resend (from address + api key)
```

## Escopo técnico (apenas frontend)

- **Arquivo alterado:** `src/routes/_authenticated/connections.tsx` (reescrita da UI).
- **Primitives:** reutilizar `DashboardPageShell`, `DashboardPanelSurface`, `KpiCard`, `PanelEmptyState` já usados em outras telas.
- **Tokens:** somente `bg-card`, `border-border/60`, `text-muted-foreground`, `text-primary` etc. Sem cores hardcoded (remover `bg-indigo-600`, `dark:bg-white`).
- **Consumo por IA:** derivar por provider agrupando `data.usage` (o server já retorna totais). Neste passo, mostrar `tokens do mês` e `custo estimado` **totais** no KPI e, por card de IA, exibir `masked key` + selector de modelo (local state) + placeholder de custo se ainda não houver breakdown por provider retornado pelo backend — usar 0/— e um badge "aguardando telemetria" para providers sem dados. Não alterar `connections.functions.ts`.
- **Seletor de modelo por IA:** novo `Select` no card com opções curadas por provider (ex.: OpenAI → gpt-5, gpt-5-mini; Anthropic → claude-sonnet-4.5, opus-4.1; Gemini → gemini-2.5-pro, gemini-2.5-flash). Persistido reutilizando `updateConnectionsSettings` (`textProvider`/`imageProvider` continuam controlando o líder global; a escolha de modelo específico fica em local state até o backend evoluir — deixaremos comentário `// TODO: persist per-provider model`).
- **Canais:** substituir a constante `CHANNELS` para incluir Instagram, Facebook, TikTok, YouTube (remover LinkedIn e Resend deste bloco). Ícones: `Instagram`, `Facebook`, `Music2` (TikTok), `Youtube` do lucide.
- **Mensageria:** novo componente `MessagingCard` reutilizando o mesmo modal de API key. WhatsApp Evolution e WhatsApp Cloud usam o mesmo endpoint `saveProviderKey`/`upsertChannel` já existente (adicionar aos tipos permitidos apenas no cliente; **não** alterar server aqui — se o Zod rejeitar, avisarei no build e ajusto num passo seguinte).

## Fora de escopo

- Sem migração de schema.
- Sem alterar `connections.functions.ts` além do estritamente necessário para aceitar os novos ids de canal (se precisar, será um ajuste mínimo no enum Zod).
- Sem integração real com WhatsApp/YouTube (apenas persistência de credenciais).

## Verificação

1. Build limpo.
2. Navegar até `/connections`: 3 blocos visíveis, KPIs no topo, cards responsivos (1/2/3–4 col).
3. Abrir modal Conectar em uma IA e em um canal — salvar/rotacionar funcionando.
4. Dark/light sem cores hardcoded quebradas.
