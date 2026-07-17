## Problema

O chip de formato (ex.: **CARROSSEL**) não aparece de forma consistente no card do pipeline `/content` — no exemplo da referência ele deveria aparecer ao lado do canal (INSTAGRAM · CARROSSEL).

## Diagnóstico (confirmado via DB)

`FORMAT_STYLES` em `src/components/content/stage-colors.ts` só tem as chaves `Feed | Reels | Story | Carrossel`, mas os dados reais em `posts.format` estão bagunçados por casing/plataforma:

```
carrossel:13 · story:13 · reel:12 · feed:12 · tiktok:12
Feed:10 · Carrossel:10 · Reels:9 · Story:5 · <nil>:8
```

Consequências no `PostCard` (`src/components/content/content-board.tsx`, linhas ~590-594):
1. Valores em minúsculo (`carrossel`, `feed`, `reel`) renderizam como texto (o `uppercase` do CSS disfarça), mas caem no estilo fallback (violet) — sem cor semântica de formato.
2. Valores que são canal e não formato (`tiktok`) aparecem como se fossem formato.
3. Quando `posts.format` é `null` (8 registros) o chip some, mesmo existindo `post_placements` com formato definido (ex.: `carrossel`, `reels`, `stories`).

Ou seja: a informação de "Carrossel" existe no banco, mas o card não a exibe por falta de normalização e de leitura das placements.

## Escopo do fix (apenas UI/apresentação)

Ajustes locais ao card do pipeline, sem tocar em backend:

1. **Normalizador de formato** em `stage-colors.ts` (`normalizeFormat(raw)`):
   - Aceita `Feed|feed|FEED` → `Feed`; `Reels|reels|reel` → `Reels`; `Stories|story|stories` → `Story`; `Carrossel|carousel|carrossel` → `Carrossel`.
   - Se o valor não bater com formato conhecido (ex.: `tiktok`, `youtube`), retorna `null` (não é formato, é canal — já é exibido pelo chip de canal).
2. **PostCard** (`content-board.tsx`):
   - Adicionar `placements?: Array<{ format: string; is_primary?: boolean }>` ao tipo `BoardPost` e ler no `PostCard` (sem quebrar backends que não retornem — fica opcional).
   - Derivar `formatLabel`:
     - Preferir `post.format` normalizado.
     - Se `null`, derivar do `placement` primário (ou o primeiro) via mesmo normalizador.
   - Renderizar UM chip por formato quando houver múltiplas placements diferentes (ex.: FEED + STORY) — máximo 3, ordem: primário primeiro.
   - Manter o estilo `border-<cor>/30 bg-<cor>/10` do DS via `FORMAT_STYLES`.
3. **`loadBoardFn`** (`src/lib/content.functions.ts`): incluir `post_placements(format,is_primary)` no select para alimentar o item 2. Ordenação de placements: `is_primary desc, created_at asc`.
4. **Fallback textual**: o texto do chip usa a versão capitalizada canônica ("Carrossel", "Reels", "Story", "Feed"), não o valor cru — assim independe do casing salvo.

## Fora do escopo

- Não alterar como `posts.format` é gravado por task-dialog / pipelines de IA (isso é uma limpeza de dados separada; se quiser, faço em uma tarefa posterior).
- Não mexer nas cores/estilos existentes de canal/prioridade/SLA.

## Resultado esperado

Todos os cards que forem carrossel — seja por `posts.format` (qualquer casing) ou por ter `post_placements.format = 'carrossel'` — passam a exibir o chip **CARROSSEL** em verde (emerald), no mesmo padrão da referência anexada. Cards com múltiplos placements mostram um chip por formato.
