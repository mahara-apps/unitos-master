## Objetivo

Criar um cliente **"Café Aurora ☕ (mock)"** no workspace ativo (brand `60fce5a7-…`) já com **briefing 100% preenchido** e toda a memória de marca (personas, voice card, SWOT, cohorts, concorrentes, pipeline) para permitir testar de ponta a ponta:

1. Abrir o cliente → briefing marca 100% → botão **"Gerar Plano do Mês"** liberado.
2. Rodar o orquestrador (Planejador → Copywriter → Direção de arte).
3. Ver as peças caírem no Kanban de Produção (estágio *Ideia*) e no Calendário.

## Identidade da marca (fictícia)

- **Nome:** Café Aurora
- **Nicho:** cafeteria de especialidade + torrefação artesanal
- **Missão:** "Iluminar o dia das pessoas com cafés de origem única, colhidos de forma justa."
- **Posicionamento:** premium acessível — entre o café de rua e a torrefação de luxo.
- **Cores:** `#4A2C1A` (Café Escuro), `#E9B872` (Dourado Alvorada), `#F5E6D3` (Cremoso), `#2C6E49` (Verde Grão).
- **Voz:** acolhedora, sensorial, curiosa; nunca pedante.
- **Público:** 25–45 anos, urbano, café como ritual matinal e social.
- **Volumetria mensal:** Instagram 20, TikTok 8, YouTube 2, LinkedIn 4.

## Entregáveis

### 1. Ativos visuais

- Gerar `src/assets/aurora-logo.png` (logo horizontal, PNG transparente, premium) via image gen.
- Gerar `src/assets/aurora-favicon.png` (símbolo do grão + sol nascendo, quadrado).
- Publicar via `lovable-assets create` para ter URL CDN estável — gravar nos campos `clients.logo_url` e `clients.favicon_url`.

### 2. Migração Supabase (uma migration SQL)

Todas as inserções escopadas à `brand_id = 60fce5a7-1859-4bbd-a887-9018ed7f17b5` e ao novo `client_id` gerado (via CTE). `created_by` = owner atual da brand (via `brand_members` role `owner`).

Registros criados:

- **`clients`** — 1 linha
  - `name = 'Café Aurora ☕ (mock)'`, `niche`, `color = '#4A2C1A'`, `tone_of_voice`, `palette` jsonb (4 cores), `socials` jsonb (@cafeaurora IG/TikTok/YT), `logo_url`, `favicon_url`.
  - `brand_hub` jsonb **cobrindo os 19 checks** de `computeBriefingCompletion`:
    `mission, positioning, values, offer, price_range, differentials, objections, audience, journey, pain_points, desires, tone_text, goals, hashtags (10), palette (4), inspirations (5), do_dont.{do,dont}, volumetry.{instagram,tiktok,linkedin,youtube,facebook}, competitors (3 handles)`.

- **`brand_briefings`** — 1 linha, `data` = espelho estruturado do briefing, `completude = 100`.
- **`brand_voice_cards`** — 1 linha ativa (`is_active = true`) com pilares, palavras-chave, exemplos ✅/❌.
- **`brand_personas`** — 1 linha ativa com 2 personas (Marina, 32, arquiteta; Ricardo, 41, empreendedor).
- **`brand_swot`** — 1 linha ativa (S/W/O/T com 3–4 itens cada).
- **`brand_cohorts`** — 1 linha ativa com 3 cohorts comportamentais.
- **`brand_competitors`** — 3 linhas (@suplicycafes, @orfeucafes, @coffeelab) com `bio_colada` e `snapshot` mock.
- **`content_pipelines`** — 1 pipeline `"Editorial Café Aurora"` (`is_default = true`) + **6 estágios** em `content_pipeline_stages` (Ideia → Roteiro → Produção → Revisão → Aprovado → Publicado) para que o orquestrador tenha onde injetar posts.

### 3. Pós-migração

- Sem mudanças de código de aplicação — apenas dados.
- Verificação manual: abrir `/customers/<novo-id>` → briefing 100% → clicar **Gerar Plano do Mês** com 1 mês / 12 peças e conferir jobs + posts no Kanban.

## Notas técnicas

- Não altero o cliente existente `541b9028-…` (também chamado "Café Aurora" mas vazio) — o novo entra com sufixo `☕ (mock)` para distinguir e preservar o histórico.
- Não crio novas tabelas, políticas RLS nem funções — só INSERTs. As policies existentes já permitem membros da brand ler/escrever.
- Fluxo do `monthly-plan` já lê `brand_hub`, `brand_personas`, `brand_voice_cards`, `brand_competitors` e `content_pipelines/stages` — os inserts acima cobrem 100% das dependências do orquestrador.
