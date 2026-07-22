## Contexto

O `BriefingWorkspace`, os editores (`SwotEditor`, `VoiceEditor`, `PersonasEditor`, `CohortsEditor`), o `StrategyPanel` (StrategyTab/TargetTab/MarketTab) e as 6 server functions do pipeline de IA (`briefingParseFn`, `voiceGenerateFn`, `personasGenerateFn`, `cohortsGenerateFn`, `swotGenerateFn`, `pautaSuggestFn`) já existem e estão íntegros. As tabelas (`brand_briefings`, `brand_swot`, `brand_personas`, `brand_cohorts`, `brand_voice_cards`, `brand_pautas`) contêm dados reais.

O único problema é UX: o único ponto de entrada era a aba **"Brain"** dentro do perfil do cliente, e essa aba foi escondida pelo `useFeatureAccess("brain")` quando a flag foi desligada. A rota `/customers/$customerId/briefing` existe mas nunca foi linkada.

## Objetivo

Reexpor Briefing e Estratégia no front **sem criar componentes novos** e **sem depender da flag `brain`**.

## Plano

**1. Criar aba "Briefing" no perfil do cliente** (`src/routes/_authenticated/customers.$customerId.tsx`)
- Adicionar entrada `{ value: "briefing", label: "Briefing" }` em `ALL_TABS`, posicionada logo após "Cadastro".
- Essa aba fica sempre visível (independente de `brainEnabled`).
- Reaproveitar exatamente o mesmo JSX que hoje está dentro de `<TabsContent value="brain">`: `<BriefingWorkspace>` com `appendSlot` contendo `<StrategyTab/>`, `<TargetTab/>` e `<MarketTab/>` (SWOT + competitiva, Personas & Público, Análise de Mercado/Cohorts).
- Manter o bloco `{brainEnabled && <TabsContent value="brain">...}` inalterado para não quebrar quem tem a flag ligada — ou simplesmente removê-lo já que o conteúdo migrou. Decisão técnica: **remover** o `TabsContent value="brain"` duplicado para evitar dois lugares mostrando a mesma coisa quando a flag estiver ligada. A aba "Brain" no `ALL_TABS` (`brain-dashboard`) continua com seu gate.

**2. Ajustar o CTA de onboarding**
- `needsOnboarding` hoje depende de `brainEnabled` (linha 201). Trocar por `completion < 60` puro.
- `onOpenBriefing` no dashboard: trocar `setActiveTab(brainEnabled ? "brain" : "cadastro")` por `setActiveTab("briefing")`.

**3. Adicionar link no sidebar quando um cliente está selecionado** (`src/components/app-sidebar.tsx`)
- Na seção "Visão geral" (que já mostra "Perfil" quando há cliente ativo), adicionar item **"Briefing"** apontando para `/customers/$id/briefing`, com ícone `BrainCircuit` ou `FileText`.
- A rota `customers.$customerId.briefing.tsx` já existe e já renderiza o `BriefingWorkspace`, então o link funciona imediatamente.

**4. Remover o gate errado da rota standalone** (verificar)
- Conferir se `customers.$customerId.briefing.tsx` não tem nenhum gate residual de `brain`. Rápida leitura mostra que não tem — só valida UUIDs. Nada a fazer.

## Detalhes técnicos

- **Arquivos editados**: `src/routes/_authenticated/customers.$customerId.tsx`, `src/components/app-sidebar.tsx`.
- **Zero mudança em backend, tabelas, RLS, migrations ou componentes de UI**. Só remontagem de navegação.
- **Sem impacto na feature flag `brain`**: o `BrainWidget` no overview e a aba do "Brain Dashboard" (rota `/brain`) continuam gated. Só o Briefing/Estratégia deixa de depender dela — que é o comportamento correto, já que são dados de marca, não do módulo Brain.
- Verificação pós-edit: navegar em `/customers/<id>` → aba Briefing carrega o BriefingWorkspace com os 17 briefings existentes; SWOT e Personas mostram os registros salvos; botões "Gerar SWOT/Personas/etc" continuam chamando as server functions já existentes.
