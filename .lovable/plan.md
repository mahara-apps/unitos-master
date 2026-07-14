## Diagnóstico do que está errado hoje

Auditei os 10 agentes seed vs. o que os pipelines realmente consomem:

| Agente | Vars no prompt (DB) | Vars que o runtime preenche | Situação |
|---|---|---|---|
| `planner_strategic` | *(nenhuma)* | `CONTEXT, PERSONAS, COMPETITORS, PRIMARY_COLORS, QUANTIDADE, PERIODO, CHANNEL_MIX` | Prompt ignora briefing — `fillTemplate` vira no-op |
| `copywriter_senior` | `CONTEXT` | `TONE, PERSONA, HASHTAGS, CONCEPT` | Variável errada, contexto do briefing nunca chega |
| `art_director_social` | 11 vars (`PRIMARY_COLORS`, `LOGO_URL`, …) | *(nenhum pipeline chama esse agente)* | Prompt promete dados que nunca chegam |
| `visual_analyst` | `N` | idem — nunca invocado | idem |
| `briefing_extractor`, `persona_generator`, `brand_brain`, `instagram_analyst`, `roteirista_social`, `construtor_agentes` | *(nenhuma)* | não são chamados via `agent_prompts` (prompts hardcoded em `customer-pipeline.ts`, `generate-ideas.ts`, `post-phase2.ts`, `copilot.ts`) | Aba "Variáveis" sempre vazia; usuário não sabe o que o agente lê |

Além disso: o Drawer mostra `{{VARS}}` extraídas, mas não explica **o que cada uma significa**, **de onde vem o valor** nem se ela é preenchida quando o agente roda em produção.

## Objetivo

Cada agente lista, no Drawer, exatamente as variáveis que o runtime resolve, com **nome, descrição, fonte (tabela/campo do Supabase), badge de status** e valor de exemplo hidratado a partir do cliente atualmente selecionado.

## Plano de implementação

### 1. Catálogo canônico de variáveis (`src/lib/agent-variables.ts`)

Fonte única da verdade — cada `VariableSpec` traz:

```ts
{ key: "PRIMARY_COLORS",
  label: "Cores primárias",
  description: "Paleta principal declarada no Brand Hub do cliente.",
  source: "clients.brand_hub.palette",
  category: "identidade" | "briefing" | "audiência" | "concorrência" | "runtime",
  required: true }
```

Inclui as 15 variáveis realmente resolvíveis hoje: `CONTEXT`, `PERSONAS`, `PERSONA`, `TONE`, `TONE_OF_VOICE`, `HASHTAGS`, `COMPETITORS`, `PRIMARY_COLORS`, `SECONDARY_COLORS`, `TERTIARY_COLORS`, `LOGO_URL`, `BRAND_CONTEXT`, `QUANTIDADE`, `PERIODO`, `CHANNEL_MIX`, `CONCEPT`, `VISUAL_ANALYSIS`, `REF_HINTS`, `USER_PROMPT`, `N`.

### 2. Resolver server-side reutilizável (`src/lib/agent-variables.functions.ts`)

`resolveAgentVariablesFn({ brandId, clientId })` — server function autenticada que consulta o Brand Hub, personas, voice card, concorrentes e devolve `Record<VariableKey, { value: string; resolved: boolean; source: string }>`. Usada tanto pelo Drawer (Preview) quanto pelos pipelines.

### 3. Migração: alinhar prompts seed com o runtime

Migration única atualizando `agent_prompts.system_prompt` **e** `default_prompt` para:

- `planner_strategic`: incluir bloco "CONTEXTO DA MARCA" com `{{CONTEXT}}`, `{{PERSONAS}}`, `{{COMPETITORS}}`, `{{PRIMARY_COLORS}}` e o pedido final usando `{{QUANTIDADE}}`, `{{PERIODO}}`, `{{CHANNEL_MIX}}`.
- `copywriter_senior`: trocar `{{CONTEXT}}` por os 4 blocos que o runtime já envia (`{{TONE}}`, `{{PERSONA}}`, `{{HASHTAGS}}`, `{{CONCEPT}}`).
- `art_director_social` e `visual_analyst`: reduzir para variáveis realmente providenciáveis ou marcar como "não-executável (referência)" no metadado.
- Demais agentes (`briefing_extractor`, `persona_generator`, `brand_brain`, `instagram_analyst`, `roteirista_social`, `construtor_agentes`): preservar prompt, mas adicionar footer padronizado `CONTEXTO: {{CONTEXT}}` para que o resolver preencha algo útil e a aba Variáveis pare de aparecer vazia.

### 4. Refatorar `monthly-plan.ts` para usar o resolver central

Substituir o `fillTemplate` inline pelo `resolveAgentVariables` + `renderPrompt(template, resolved)`. Antes de disparar cada agente, validar que todas as variáveis `required` do agente estão `resolved: true`; se não, emitir aviso no `step_label` e continuar com fallback `(não informado)` — sem crash.

### 5. Drawer: aba **Variáveis** premium

Cada variável extraída vira um card com:

- Nome canônico + `{{TOKEN}}` em mono.
- Descrição em texto claro ("de onde vem", "pra que serve").
- Badge de fonte (`Brand Hub`, `Personas`, `Runtime`, `Concorrentes`).
- Badge de status hidratado com o cliente ativo: **Resolvida ✅** / **Faltando ⚠️** / **Runtime (fornecida na execução)**.
- Toggle "Ver valor" — mostra os primeiros ~300 chars do valor real que seria enviado ao modelo.
- Botão "Reidratar" no header da aba.

Variáveis extraídas do prompt que **não** existam no catálogo aparecem em uma seção separada "Não reconhecidas" com CTA para editar o prompt.

### 6. Aba **Prompt**: linter inline

- Highlight verde para variáveis resolvidas, âmbar para faltando, cinza para não reconhecidas.
- Barra superior com contagem "8 variáveis · 6 resolvidas · 2 faltando".

### 7. Playground executa de verdade

Trocar o `setTimeout` mock por chamada ao Lovable AI Gateway (nova server function `runAgentPlaygroundFn`) que:
1. Roda o resolver com o cliente ativo.
2. Aplica overrides digitados na aba Variáveis.
3. Renderiza o prompt.
4. Chama `google/gemini-2.5-flash` com `system` + `prompt` = input do usuário.
5. Retorna texto para o console dark.

### 8. Página `/agents`: painel "Saúde dos agentes"

Card no topo mostrando "X de Y agentes com todas as variáveis resolvidas" no cliente selecionado, com link para o primeiro agente com pendências.

## Detalhes técnicos

- **Nova tabela:** nenhuma. Catálogo vive em código (`agent-variables.ts`) porque muda com deploy.
- **Nova coluna:** nenhuma. `agent_prompts` já tem `default_prompt` (restaurar padrão continua funcionando após a migração porque também atualizamos `default_prompt`).
- **RLS:** inalterado. `resolveAgentVariablesFn` usa `requireSupabaseAuth` (respeita RLS por brand/cliente).
- **Playground:** custo controlado via `LOVABLE_API_KEY` já existente; sem novo secret.
- **Compat:** o pipeline `monthly-plan.ts` continua com o mesmo comportamento externo; apenas passa a preencher os campos que o prompt novo declara. Ideias/Estratégia/Copilot permanecem com prompts hardcoded (fora do escopo desta task).

## Fora do escopo

- Migrar `customer-pipeline.ts`, `generate-ideas.ts`, `post-phase2.ts` para lerem `agent_prompts` (é uma refactor maior; pode ser próximo ciclo).
- Editor de catálogo de variáveis por UI.
