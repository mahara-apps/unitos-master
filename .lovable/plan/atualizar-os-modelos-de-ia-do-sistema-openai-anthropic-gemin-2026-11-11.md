# Atualizar os modelos de IA do sistema (OpenAI, Anthropic, Gemini, Groq)

## Resultado da checagem (11/11/2026)

Comparei a lista de modelos do sistema com as páginas oficiais de cada provedor. Hoje não há troca automática registrada além da do Groq (agosto: llama-3.3 -> gpt-oss-20b).

| Provedor | Em uso hoje | Situação | Atual no provedor |
| --- | --- | --- | --- |
| OpenAI | gpt-5 / gpt-5-mini | Duas gerações atrás (reserva: gpt-4.1, gpt-4o-mini) | GPT-6 Astra, GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Luna |
| Anthropic | Opus 5.5 / Sonnet 4.5 | Opus em dia; **Sonnet 4.5 é desligado em 30/11/2026** | Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5 |
| Gemini | flash-latest (reserva 3.6-flash, 2.5-flash) | Em dia pelo apelido; 2.5-flash já desligado; embeddings 001 com fim em 2028 | Gemini 4 Argon/Carbon, 3.8 Flash, gemini-embedding-2 |
| Groq (reserva) | gpt-oss-120b / 20b | Em dia; reservas kimi-k2 e llama-3.1-8b saíram do catálogo comum | gpt-oss-120b / 20b |

Urgente: Anthropic Sonnet 4.5 (todas as instalações que usam Anthropic no dia a dia).

## O que muda

1. **OpenAI**: principal estratégico GPT-6 Astra, operacional GPT-6.1 Sol; reserva GPT-6.1 Terra e GPT-6 Luna; tirar gpt-4.1/4o-mini.
2. **Anthropic**: operacional Sonnet 5.5; reserva Sonnet 5, Haiku 5.5; Opus 5.5 continua estratégico (Fable 5.2 fica como opção, não padrão, por custo). Marcar Sonnet 4.5 como desligado a partir de 30/11.
3. **Gemini**: manter flash-latest; reserva gemini-3.8-flash e gemini-4-argon; tirar 2.5-flash e marcá-lo como desligado. Embeddings: preparar gemini-embedding-2 (só troca com reindexação, ver abaixo).
4. **Groq**: manter gpt-oss; tirar kimi-k2 e llama-3.1-8b da reserva.
5. **Preços** usados no controle de orçamento atualizados para os modelos novos.
6. Conferência de cada nome de modelo contra a lista oficial do próprio provedor (pela chave de uma instalação) antes de fechar a versão; nome não confirmado não entra.

## Fora desta rodada (precisa de decisão)
- Trocar embeddings para gemini-embedding-2 exige refazer os vetores da base de conhecimento (não são compatíveis). Proponho deixar para uma rodada própria, já que o atual vale até 2028.

## Detalhes técnicos
- `src/lib/ai-models-catalog.server.ts`: `MODEL_CATALOG`, `MODEL_FALLBACKS`, `RETIRED_MODELS`; overrides em `ai_model_catalog_overrides` continuam valendo (migração limpa overrides que apontem para modelos desligados).
- Tabela de preços em `ai-usage.server.ts`; listas da interface em `ai-center.tsx` / `agent-meta.ts`.
- Testes do catálogo: nenhum default/reserva em `RETIRED_MODELS`; Groq nunca principal.
- MASTER-first: build_delta.py, delta_version.txt = MASTER_RELEASE_VERSION (1.4.87), verify-installation, `bun run master:check`. Publicação só com autorização.
