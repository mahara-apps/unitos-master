## Objetivo

Habilitar edição manual (create / update / delete) em **todos** os campos da estratégia gerada por IA nas abas **Estratégia**, **Público** e **Mercado** do Cérebro da Marca, para que o time possa corrigir/complementar o output da IA sem depender de re-geração.

## Escopo dos artefatos editáveis

| Aba | Artefato | Tabela / campo | Ação |
|---|---|---|---|
| Estratégia | Voice Card (personalidade, tom, palavras preferidas/proibidas, do/don't, mensagens-chave) | `brand_voice_cards.data` | update |
| Público | Personas (nome, arquétipo, dores, canais, lógica/psicologia de compra, objeções…) | `brand_personas` (linha por persona, `data`) | create / update / delete / toggle `is_active` |
| Público | Cohorts (nome, traits, estratégia, critérios de conversão) | `brand_cohorts.data` | update (array) |
| Mercado | SWOT (forças/fraquezas/oportunidades/ameaças) | `brand_swot.data.analysis` | update |
| Mercado | Competitors (handle, posicionamento, sentimento, notas) | `brand_competitors` | create / update / delete |

Briefing (aba Cérebro da Marca) já tem edição — fora do escopo.

## UX

- Cada `SectionCard` ganha botão **Editar** no canto superior direito (ícone `Pencil`).
- Ao entrar em modo edição, os textos viram `Input` / `Textarea` e chips viram `TagInput` (add/remove). Ações **Salvar** / **Cancelar** aparecem no rodapé do card.
- Personas e Competitors: lista com botão **+ Adicionar** e ícone lixeira por item; abre em um `PersonaDrawer` / `CompetitorDialog` (reuso do drawer existente com campos editáveis).
- SWOT: grid 2x2 vira formulário de 4 `TagInput` (um por quadrante).
- Salvamento otimista com `useMutation` + `invalidateQueries` nas queries `customerCoreQuery` / `customerTargetQuery` / `customerMarketQuery`.
- Validação leve com Zod (limites de caracteres, arrays sem vazios).
- Somente `owner/admin/editor` conseguem editar (`use-access-role` já disponível); demais veem os campos read-only.

## Backend (novos server functions em `src/lib/brand-strategy.functions.ts`)

Todos com `.middleware([requireSupabaseAuth])` + checagem `is_brand_member` + validação Zod:

- `updateVoiceCardFn({ clientId, data })` → upsert em `brand_voice_cards` por `client_id`.
- `upsertPersonaFn({ clientId, personaId?, data, isActive })` → insert ou update em `brand_personas`.
- `deletePersonaFn({ personaId })`.
- `updateCohortsFn({ clientId, data })` → upsert do array em `brand_cohorts`.
- `updateSwotFn({ clientId, analysis })` → upsert em `brand_swot`.
- `upsertCompetitorFn({ clientId, competitorId?, handle, ... })` / `deleteCompetitorFn`.

Cada handler grava também `updated_at = now()` e um registro em `activity_events` (`verb = 'edited_manually'`) para audit trail.

## Frontend

Arquivos novos:
- `src/components/ai-agents/edit/voice-card-editor.tsx`
- `src/components/ai-agents/edit/persona-editor.tsx` (usado dentro do `PersonaDrawer`)
- `src/components/ai-agents/edit/cohort-editor.tsx`
- `src/components/ai-agents/edit/swot-editor.tsx`
- `src/components/ai-agents/edit/competitor-editor.tsx`
- `src/components/ui/tag-input.tsx` (chip input reutilizável — se ainda não existir)

Alterações:
- `src/components/ai-agents/strategy-panel.tsx`: cada `SectionCard` recebe prop opcional `onEdit`; ao clicar troca conteúdo pelo editor correspondente. `PersonaDrawer` passa a ter modo edição inline. Grid do SWOT e tabela de competitors ganham CTAs.

## Fora de escopo (não mexer agora)

- Regenerar via IA a partir da edição manual.
- Versionamento/histórico de mudanças (fica só o `activity_events`).
- Edição em massa por CSV.

## Detalhes técnicos

- Persistência: usar `context.supabase` do middleware (respeita RLS) — não usar `supabaseAdmin`.
- Zod schemas partilhados entre client e server em `src/lib/brand-strategy.schemas.ts`.
- Invalidação: após cada mutação, `qc.invalidateQueries({ queryKey: ["customer", clientId] })` (raiz comum das três queries) e `queryClient.setQueryData` otimista quando trivial.
- Manter os normalizers atuais funcionando — os editores gravam já no formato canônico esperado pelos normalizers (chaves PT-BR), evitando divergência com output da IA.
