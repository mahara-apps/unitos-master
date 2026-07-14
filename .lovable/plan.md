## Diagnóstico

Rodei a Fase 1 no cliente **Café Aurora** e confirmei os sintomas contra o Supabase:

- Job `customer_pipeline_phase1` concluiu com sucesso em ~2 min 5 s (17:23 → 17:25).
- As linhas `brand_voice_cards`, `brand_personas`, `brand_cohorts`, `brand_swot` foram inseridas — mas o **shape do JSON não bate com o que a UI lê**.
  - Voice card salvo tem chaves `versao / persona / tom_de_voz / guia_de_hashtags`. `strategy-panel.tsx` lê `data.voice_card.brand_personality`.
  - Personas salvas são array direto de `{ nome_persona, biografia, dores, ... }`. UI lê `data.personas[].nome`.
  - Cohorts idem — vem `array` sem envelope `{ cohorts: [...] }` e sem os campos `behavioral_traits/content_strategy/conversion_criteria`.
  - SWOT vem sem `swot_analysis` e sem `competitive_matrix`.

Causa raiz: para agentes "estratégicos" (`voice/personas/cohorts/swot`) o provider é criado com `structuredOutputs: false` (Gemini 2.5 Pro), então o schema Zod **não é enforçado** pelo provider. Quando o modelo devolve JSON em PT-BR livre, o `Output.object` do AI SDK cai no `NoObjectGeneratedError`, o `catch` extrai `err.text` e persiste **exatamente** o JSON bruto do modelo — sem validação/normalização. Resultado: shape divergente e telas em branco.

Além disso: 4 chamadas sequenciais em Gemini 2.5 Pro custam ~90 s do tempo total.

## Escopo da correção — apenas `src/routes/api/jobs/customer-pipeline.ts` (backend) + leitores da UI

### 1. Prompt + persistência canônica (backend)

- Reforçar em cada `system` prompt: **"Use EXATAMENTE as chaves em inglês listadas no schema. Não traduza nomes de campos."** Incluir mini exemplo de shape esperado no `prompt`.
- Depois do `runStructured`, aplicar um **normalizador** que aceita tanto o shape canônico quanto os aliases em PT-BR mais comuns e devolve o shape canônico antes do `insert`:
  - Voice: mapear `persona.arquetipo → brand_personality`, `tom_de_voz.principais → tone_characteristics`, `guia_linguistico.vocabulario_usar/evitar → vocabulary_rules.words_to_use/avoid`, `exemplos_praticos.*_certo → brand_phrases_examples`.
  - Personas: aceitar `array` cru **ou** `{ personas: [...] }`; mapear `nome_persona → nome`, `biografia → descricao`, `objetivos → desejos`, `demografia → gatilhos_de_decisao` (fallback vazio), garantindo os campos exigidos.
  - Cohorts: aceitar `array` cru **ou** `{ cohorts: [...] }`; derivar `behavioral_traits/content_strategy/conversion_criteria` a partir de aliases (`comportamento`, `estrategia_conteudo`, `criterio_conversao`) e envelopar em `{ cohorts: [...] }`.
  - SWOT: envelopar em `{ swot_analysis: {...}, competitive_matrix: [...] }`, mapeando `forcas/fraquezas/oportunidades/ameacas` quando presentes.
- Se o normalizador não conseguir preencher o mínimo (ex: 0 personas), marcar o job como `failed` com mensagem clara em vez de gravar dados vazios.

### 2. Redução de latência (backend)

- Rodar **personas** e **voice** em paralelo (independentes do briefing estruturado).
- Rebaixar `voice` e `cohorts` para `gemini-2.5-flash` (mantém `pro` só em `personas` e `swot`, onde qualidade compensa).
- Meta: cair de ~2 min para ~45–60 s.

### 3. Leitores tolerantes (UI, defensivo)

Em `src/components/ai-agents/strategy-panel.tsx`, ampliar os normalizadores existentes (`normalizePersonas`, `normalizeCohorts` e leitura de `voice_card` / `swot_analysis`) para reconhecer os mesmos aliases PT-BR, garantindo que dados legados já gravados (como o mock seed do Café Aurora) apareçam sem precisar regerar.

### 4. Fora de escopo

- Nada no schema do Supabase muda.
- Nada nos agentes individuais (`agent-tabs.tsx`) muda — eles já usam prompts próprios.
- Prompts do `monthly-plan` e `copilot` não são tocados.

## Resultado esperado

- Voice Card, Personas (com nome), Cohorts (com traits/estratégia/critério) e Mercado (SWOT + matriz) passam a renderizar imediatamente após a geração.
- Dados antigos do Café Aurora aparecem sem precisar rodar de novo, graças aos leitores tolerantes.
- Geração da Fase 1 fica visivelmente mais rápida.
