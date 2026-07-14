# Multi-Placement em um Único Card

## Problema
Hoje cada card = 1 formato. Se o usuário quer publicar o mesmo conceito em **Feed + Stories** (ou Reels + Stories), precisa duplicar cards, duplicar mídias, duplicar aprovações. Ineficiente e polui o calendário.

## Estratégia
Transformar `format` (single) em **placements[]** (multi), preservando 1 card = 1 conceito criativo, mas com N destinos de publicação, cada um com sua própria regra (horário, mídia adaptada, copy adaptada, status de publicação).

Não é obrigatório — usuário continua podendo criar card single-format. Multi-placement é **opt-in**.

## Regras de negócio

**Combinações válidas** (o "cérebro" da regra):
- ✅ `Feed + Stories` → mais comum (post principal + teaser 24h)
- ✅ `Reels + Stories` → reels compartilhado no story
- ✅ `Carrossel + Stories` → divulgação do carrossel
- ❌ `Feed + Reels` → conflita (Reels já ocupa grid); bloqueado com aviso
- ❌ `Feed + Carrossel` → mesmo espaço; bloqueado

**Aproveitamento de mídia por placement**:
- Feed/Carrossel: 1:1 ou 4:5
- Stories/Reels: 9:16
- Se usuário só enviou 1:1 e adicionou Stories → sistema mostra aviso "adapte a mídia 9:16" (não bloqueia; permite salvar como pendência)
- Opcional futuro: auto-crop com IA (fora do escopo desta fase)

**Copy por placement**:
- Compartilhada por padrão (hook/headline/copy/CTA/hashtags únicos)
- Override opcional por placement (ex.: Stories usa só hook + sticker CTA)
- UI: toggle "Personalizar copy para Stories"

**Agendamento por placement**:
- Cada placement tem seu `scheduled_at` independente
- Default inteligente: Feed no horário principal; Stories +2h depois; Reels em horário de pico de vídeo
- Reaproveita o motor `src/lib/scheduling.ts` (best_times por formato)

**Aprovação**:
- 1 aprovação = aprova todos os placements do card (mesmo conceito)
- Rejeição pode ser granular ("rejeitar só Stories") — fase 2

**Publicação**:
- Status independente por placement (`draft/scheduled/published/failed`)
- Card só entra em "Publicado" quando todos placements publicaram

## Modelo de dados

Nova tabela `post_placements` (1-N com `posts`):
```
post_placements
- id uuid pk
- post_id uuid fk posts(id) cascade
- brand_id, client_id (denormalizado p/ RLS)
- format text ('feed'|'stories'|'reels'|'carrossel')
- scheduled_at timestamptz
- copy_override jsonb null   -- {hook,headline,copy,cta,hashtags} quando personalizado
- media jsonb default '[]'   -- refs de mídia específicas deste placement (fallback: mídia do post)
- status text default 'draft'
- published_at timestamptz null
- external_ref text null     -- id retornado pela API do Instagram
- created_at/updated_at
```

Migração de dados existente: cada post atual vira 1 placement com seu `format` e `scheduled_at` atuais. Coluna `posts.format` mantida como "formato primário" para compat + KPIs rápidos.

RLS + GRANT via helper `is_brand_member` já existente.

## UI/UX

**Card TaskDialog**:
- Novo bloco "Placements" no topo (abaixo do estágio/responsável)
- Chips selecionáveis: `[✓ Feed] [+ Stories] [+ Reels] [+ Carrossel]`
- Ao adicionar placement inválido → toast explicando a regra
- Cada placement expande accordion com: data/hora, mídia (herda ou override), toggle "personalizar copy"

**Calendário**:
- Um card com 2 placements aparece **2x** no calendário (uma por data/hora), com badge visual `↳ do mesmo conceito` linkando ao card mestre
- KPIs (Feed/Stories/Reels/Carrossel) contam **placements**, não cards → números refletem a realidade da publicação
- Filtros por formato continuam funcionando (filtram placements)

**Board (`/content`)**:
- Card mostra badges de todos os placements: `Feed · Stories`
- Preview usa a mídia do formato primário

## AI Engine
- Prompt do gerador de ideias ganha campo `suggested_placements[]`
- Heurística: hook educativo longo → Feed+Stories; hook viral curto → Reels+Stories; produto → Carrossel+Stories
- Persistência: cria post + N placements na mesma transação

## Rollout (fases)
1. **DB + migração** (posts existentes → 1 placement cada)
2. **CRUD de placements** em `task-dialog.tsx` (opt-in, começa com Feed+Stories)
3. **Calendário e KPIs** consumindo placements
4. **AI** sugerindo combinações
5. **Publicação real** via Instagram Graph (fase futura — hoje é mock)

## Fora do escopo desta fase
- Auto-crop 1:1 → 9:16
- Aprovação granular por placement
- Cross-posting para outros canais (TikTok, LinkedIn)
