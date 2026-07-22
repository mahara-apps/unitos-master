## Objetivo
Elevar o "Novo agendamento" a padrão enterprise, resolvendo 5 pontos: aproveitamento de tela, dica de ESC, preview reativo ao formato/rede, local vindo da API do Instagram e validação do campo Link por tipo de publicação.

---

### 1. Aproveitamento de tela
Arquivo: `src/components/calendar/schedule-wizard/index.tsx`

- Reduzir paddings das 3 colunas de `p-6` → `px-5 py-4`, `space-y-5` → `space-y-4`; header de `py-3` → `py-2.5` e footer idem.
- Dropzone: encolher altura (h-24 com layout horizontal ícone+texto+botão) para liberar espaço vertical da coluna 2.
- Biblioteca do cliente: grid `grid-cols-4` → `grid-cols-5` e mostrar até 30 miniaturas com scroll interno.
- Coluna 3 (Preview): sticky vertical + reduzir padding externo; card do preview cresce até `max-w-[380px]` e ganha respiro proporcional.
- Extras (Primeiro comentário / Link / Local): compactar em grid `sm:grid-cols-3` com labels menores.

### 2. Atalho ESC no rodapé
- Adicionar `useEffect` que escuta `keydown` Esc e chama `onOpenChange(false)` (respeitando `submitting`).
- No rodapé, exibir hint sutil à esquerda: `<kbd>Esc</kbd> para sair · <kbd>⌘</kbd>+<kbd>S</kbd> salvar rascunho` (aria-hidden). `⌘+S` dispara `persist("save_draft")`.

### 3. Preview reativo ao formato + rede
- `previewChannel` passa a ser `{ channel, format }`: seletor no header do preview lista pares selecionados (`Instagram · Reels`, `Instagram · Feed`, `Facebook · Stories`).
- `PostPreview` recebe `format` e ajusta:
  - **Feed (IG/FB)**: aspect-ratio 1:1, chrome com like/comment/share/bookmark, legenda abaixo.
  - **Reels / TikTok / Shorts / IG Stories / FB Stories**: aspect-ratio 9:16, overlay full-bleed (handle/legenda sobrepostos, botões laterais), fundo preto.
  - **Carousel**: aspect 1:1 + dots inferiores (`selectedMedia.length` bolinhas).
  - **LinkedIn Feed / X**: chrome próprio (sem coração/instagram), mídia 1.91:1 com legenda acima.
- Ícone/cor do badge de rede reutilizando `SOCIAL_CHANNELS`/logotipos existentes (mesmo esquema do `pending-schedule-panel`).
- Vídeos: mostrar controles mudos + loop em todos os formatos.

### 4. Local via integração Instagram
Backend novo — `src/lib/meta/locations.functions.ts`:
- `searchInstagramLocationsFn({ connectionId, query, latitude?, longitude? })` protegido por `requireSupabaseAuth`.
- Carrega a `social_connections` do usuário, valida `channel="instagram"` e `brand_id` acessível, decripta `access_token`.
- Chama Graph API `GET /pages/search?q=<query>&type=place&fields=id,name,location{city,country,street},category&limit=8` com o token IG (Page token vinculado). Cache in-memory por 5min via `unstable_cache` simples (Map).
- Retorna `{ id, name, subtitle }[]`.

Frontend:
- Novo componente `LocationCombobox` (Popover + Command) que substitui o `<Input>` de Local. Debounce 250ms, chama a server fn com o `connectionId` do primeiro par IG selecionado. Se não houver IG conectado → fallback para input livre com tooltip "Conecte um Instagram para buscar locais".
- Armazena `locationName` + `locationId` no estado; envia `locationId` em `destinations[]` (extend `saveScheduledPostFn` payload e `social_posts.location_id`).
- Migração: `ALTER TABLE public.social_posts ADD COLUMN location_id text NULL;` (com GRANTs já existentes, sem RLS change) e passar o `location_id` para o publisher (`meta/publishing.functions.ts` já aceita — apenas encaminhar).

### 5. Validação do campo Link por tipo
Regras Meta:
- **IG Feed / IG Reels / IG Carousel**: links na legenda não são clicáveis. Marcar campo como "não recomendado" quando todos os pares selecionados forem IG desses formatos.
- **IG Stories**: link vira sticker → permitido, hint "vira sticker de link".
- **Facebook Feed / LinkedIn / X**: clicável, sem alerta.
- **TikTok / Shorts / FB Reels**: também não clicável.

Implementação em `index.tsx`:
- Derivar `linkPolicy` de `pairs`: `"clickable" | "sticker" | "not-clickable" | "mixed"`.
- Renderizar bandeira contextual abaixo do input (`AlertTriangle` amarelo para not-clickable/mixed; info neutra para sticker).
- Não bloqueia envio; apenas informa. `linkUrl` continua salvo.

---

### Aceitação
- Wizard cabe sem scroll vertical na coluna 1 até "Extras" em 1440×900.
- Tecla ESC fecha o sheet (exceto durante submit).
- Alternar par IG · Reels ↔ IG · Feed muda o preview para 9:16 vs 1:1.
- Campo Local sugere resultados reais do Graph após digitar 3+ chars, com conta IG selecionada.
- Selecionar apenas "Instagram · Feed" mostra alerta amarelo no campo Link; adicionar "Instagram · Stories" muda para hint neutro.

### Fora do escopo
- Reescrita do publisher além de encaminhar `location_id`.
- Preview interativo (swipe de carrossel).
- Autocomplete de local para redes não-Meta.
