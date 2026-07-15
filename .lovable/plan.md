## Objetivo
Incluir três novos canais sociais na aba **Canais** de `/connections`: **LinkedIn**, **Twitter/X** e **Threads**, mantendo o mesmo padrão visual dos cards existentes (Instagram, TikTok, Facebook, YouTube).

## Mudanças

### 1. `src/lib/connections.functions.ts`
Adicionar `"twitter"` e `"threads"` ao enum `channel` do `ChannelInput` (LinkedIn já existe). Isso libera persistência via `upsertChannel`.

### 2. `src/routes/_authenticated/connections.tsx`
Adicionar três entradas em `SOCIAL_CHANNELS`:

- **LinkedIn** — ícone `Linkedin` (lucide), tom `text-sky-700`, hint "Company Pages & posts", handle "linkedin.com/company/marca".
- **Twitter/X** — ícone `Twitter` (lucide), tom `text-foreground`, hint "Posts & threads", handle "@marca".
- **Threads** — ícone `AtSign` (lucide, não há ícone oficial), tom `text-foreground`, hint "Meta Threads", handle "@marca".

Atualizar o `hint` do painel "Canais Sociais" para listar os novos: `"Instagram · TikTok · Facebook · YouTube · LinkedIn · X · Threads"`.

Nenhuma alteração de schema/DB, RLS ou telemetria — os novos canais reutilizam a coluna `channels` (JSONB) de `brand_connections`.

## Fora do escopo
- Integração real com as APIs (LinkedIn/X/Threads) — permanece registro manual de handle + status conectado, como os demais canais.
- OAuth via connectors — pode ser um passo seguinte se quiser publicação nativa.
