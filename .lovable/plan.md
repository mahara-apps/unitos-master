
## Diagnóstico atual

O wizard (`src/components/calendar/schedule-wizard/index.tsx`) e o publisher (`src/lib/meta/publishing.server.ts`) hoje estão desalinhados:

- **Wizard permite escolher qualquer formato** (Feed, Stories, Reels, Carrossel) sem checar mídia nem capacidade do canal — a seleção é livre e não conversa com o que existe na biblioteca.
- **Publisher só sabe publicar 2 placements**: `instagram_feed` (imagem única) e `facebook_feed`. Reels, Stories e Carrossel na prática **falham** ao ir pra fila — quem agenda hoje um Reels vê o post sair como `failed` no `social_posts`.
- **Editor não tem**: hashtags, menções, primeira comentário, localização (place_id), música/áudio (Reels), thumbnail de vídeo, alt text, link (FB).
- **Biblioteca de mídia**: `listBrandMediaFn` só é chamada com `kind: "image"` no ComposerDialog, e o wizard nem filtra por tipo — vídeo não aparece como opção no picker. Não há upload de vídeo no fluxo de agendamento.
- **Sem auto-detecção**: a seleção da mídia não sugere formato, e formatos incompatíveis com o arquivo não são bloqueados.

## O que este plano entrega

Resposta objetiva às perguntas do usuário, em três frentes:

### 1. Auto-seleção de formato a partir da mídia (o "core")

Introduzir uma matriz de compatibilidade `MEDIA_KIND × CHANNEL → FORMAT[]` em `src/lib/scheduling-formats.ts`:

```text
imagem única      → IG Feed, IG Stories, FB Feed
múltiplas imagens → IG Carrossel, FB Feed
vídeo curto (<90s)→ IG Reels, IG Stories, FB Reels
vídeo longo       → FB Feed (vídeo), YouTube (futuro)
```

Fluxo novo do wizard:
- **Passo 1 (Canais)**: só marca canais conectados; NÃO escolhe formato ainda.
- **Passo 2 (Editor)**: usuário escolhe mídia (imagem OU vídeo OU carrossel) → sistema **auto-sugere** o formato por canal e mostra chips **desabilitados** para o que a mídia não suporta, com tooltip do porquê.
- Se o usuário quer forçar outro formato compatível (ex.: imagem no Stories em vez de Feed), pode alternar; formatos incompatíveis ficam bloqueados.

### 2. Editor rico (paridade com Meta Business Suite)

Novos campos em `StepEditor` do wizard e persistência em `post_placements.copy_override` (JSONB já existe):

- **Hashtags** (chips com autocomplete a partir de um catálogo simples por marca; contador separado do texto).
- **Menções** (@handles — texto livre, validação de formato).
- **Primeiro comentário** (Instagram — enviado após publicação via `/{ig_media_id}/comments`).
- **Localização** (place_id — busca `pages/search` da Graph API; opcional, IG/FB).
- **Link** (FB Feed only — já suportado no publisher, só falta UI).
- **Música/áudio** (IG Reels — nota: API oficial de música exige `music_track_id` do catálogo licenciado da Meta; entra como campo livre "reference" v1, gravado em `copy_override.audio_hint`, sem envio automático — deixamos claro na UI que só está disponível para Reels).
- **Thumbnail de vídeo** + **Alt text de imagem** (acessibilidade).

Overrides por placement continuam funcionando (o wizard já grava por `format`).

### 3. Upload e reconhecimento de vídeo

- **`listBrandMediaFn`** passa a devolver `kind` ("image" | "video") e `duration_seconds` (já temos coluna em `brand_media`, só filtrar).
- **`MediaPicker`** do wizard mostra imagens **e** vídeos, com badge de duração e um botão **"Enviar novo"** que reaproveita o upload existente da aba Biblioteca (mesmo `signed upload URL` → `brand-media`), permitindo subir arquivo direto do wizard sem sair.
- Ao selecionar N itens, o wizard classifica automaticamente:
  - 1 imagem → `single_image`
  - 2+ imagens → `carousel`
  - 1 vídeo → `video` (curto/longo por duração)
  - Mistura imagem+vídeo → bloqueia com aviso (Meta não aceita no Feed).

### 4. Publisher — cobrir Reels, Stories e Carrossel

Expandir `src/lib/meta/publishing.server.ts` e o enum de `PLACEMENTS` em `publishing.functions.ts`:

- **IG Reels**: `POST /{ig_id}/media` com `media_type=REELS` + `video_url`, aguarda `status_code=FINISHED` (polling curto), depois `media_publish`.
- **IG Stories**: `media_type=STORIES` (imagem ou vídeo), sem legenda.
- **IG Carrossel**: cria N containers `is_carousel_item=true`, depois container pai `media_type=CAROUSEL` e publica.
- **FB Reels**: endpoint `/{page_id}/video_reels` (upload em fases). Documentar limite (v1 suporta `file_url` público; upload resumable fica pra iteração 2).
- **Localização** (`location_id`) e **primeiro comentário** são enviados como passos extras após o publish, com fallback silencioso se falhar.

## Detalhes técnicos

- **Arquivos alterados**
  - `src/lib/scheduling-formats.ts` — nova matriz `mediaKind → formats` e helpers `inferFormatsForMedia`, `isFormatCompatible`.
  - `src/lib/brand-media.functions.ts` — `listBrandMediaFn` retorna `kind`, `durationSeconds`, aceita `kind: "all"` como default; helper `signBrandMediaFn` já existe.
  - `src/components/calendar/schedule-wizard/index.tsx`:
    - `StepChannels` vira apenas seleção de canais (sem formato).
    - Novo `StepEditor` com abas **Conteúdo** / **Mídia** / **Avançado (hashtags, menções, comentário, local)**.
    - Nova `StepPlacements` (auto-sugerido, editável) entre Editor e Revisão.
  - `src/lib/scheduling-wizard.functions.ts` — `saveScheduledPostFn` grava `hashtags`, `mentions`, `first_comment`, `location_id`, `link`, `audio_hint` em `post_placements.copy_override`; propaga `media_kind` no `media[]`.
  - `src/lib/meta/publishing.functions.ts` — enum de placements passa a incluir `instagram_reels`, `instagram_stories`, `instagram_carousel`, `facebook_reels`.
  - `src/lib/meta/publishing.server.ts` — implementação Reels/Stories/Carrossel + poll de status + first-comment + location.
  - `src/routes/api/public/meta/publish-scheduled.ts` — sem mudança de contrato; passa a chamar novos placements automaticamente.

- **Schema/DB**
  - Sem novas tabelas. Colunas já existem: `post_placements.copy_override JSONB`, `post_placements.media JSONB`, `brand_media.kind`, `brand_media.duration_seconds`.
  - Migration opcional: `CHECK` em `post_placements.format` para bloquear combinações inválidas com `channels`.

- **Fora de escopo v1** (comunicar na UI com badge "em breve")
  - Upload resumable de vídeos grandes para FB Reels.
  - Envio real de faixa musical licenciada (Meta exige `music_track_id`).
  - Agendamento nativo do Instagram Reels via Creator Studio (a API pública só permite publish imediato; agendamento continua feito no nosso worker).

## Fora do escopo deste plano

- Refazer o `ComposerDialog` (`/content`) — ele é um caminho paralelo antigo que será deprecado depois que o wizard cobrir tudo. Vou marcar com um comentário `@deprecated`, sem tocar.
- OAuth novo de TikTok/LinkedIn/YouTube para publicar de verdade — segue como "Em breve".

Depois de implementado: seleção de formatos vira **consequência da mídia**, não uma escolha solta que quebra na hora de publicar.
