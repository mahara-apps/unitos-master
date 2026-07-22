## Objetivo

Fazer com que o "texto" que alimenta o pipeline de estratégia (Briefing · Voz · Personas · Cohorts · SWOT) venha exclusivamente de duas fontes já persistidas — **modal de novo cliente** (`clients.*`) + **Cérebro da Marca** (`clients.brand_hub`) — em vez de ser montado no cliente. E garantir que essas mesmas fontes fiquem visíveis no wizard "Onboarding rápido" e na aba "Identidade" antes de qualquer chamada de IA.

Sem esta correção, o pipeline continua sendo alimentado por strings compostas no browser (`buildBriefing`/`buildStrategyBriefing`), que ignoram parte do que já foi capturado (logo, cor, socials completos, contato, tone_of_voice legado) e podem ir para a IA com contexto insuficiente ou divergente do que aparece na UI.

## O que muda

### 1) Backend passa a montar o briefing a partir do banco

Arquivo: `src/routes/api/jobs/customer-pipeline.ts`

- Tornar o campo `texto` **opcional** no schema de input (manter min só quando enviado).
- No handler, antes de disparar `runPhase1`, ler no Supabase (via `context.supabase`, já autenticado):
  - `clients`: `name, niche, color, logo_url, tone_of_voice, contact_name, contact_email, socials, brand_hub`
- Compor o `raw_text` no servidor usando **todos** os campos disponíveis (Cadastro rápido + Cérebro completo). Ordem sugerida: identidade (nome, nicho, tom, missão, posicionamento, valores) → produto (oferta, preço, diferenciais, objeções) → público (audiência, jornada, dores, desejos) → concorrentes/inspirações → hashtags/paleta/do-dont → volumetria + metas → contato + canais sociais.
- Se o cliente também enviou `texto` (compat: wizard/briefing atuais), usar como **complemento** ao final ("Notas adicionais do usuário: …"), nunca como substituto.
- Validar comprimento mínimo pós-composição; se ainda for insuficiente, devolver 400 com mensagem clara ("preencha ao menos Nome + Nicho + um bloco do Cérebro").

### 2) Front deixa de compor o texto

Arquivos: `src/components/brand-hub/quick-onboarding-wizard.tsx`, `src/components/brand-hub/briefing-workspace.tsx`

- Remover `buildBriefing`/`buildStrategyBriefing`. A chamada `fetch("/api/jobs/customer-pipeline")` passa a enviar só `{ brandId, clientId, pautasQuantidade, pautasPeriodo }`.
- Antes de disparar, salvar o estado corrente do wizard/form em `brand_hub` (já faz), garantindo que o backend leia dados atualizados.

### 3) Wizard "Onboarding rápido" mostra o que já veio do modal

Arquivo: `src/components/brand-hub/quick-onboarding-wizard.tsx`

- Ao carregar `hubQ`, também expor `name`, `niche`, `socials`, `color`, `logo_url` (o `getBrandHub` já retorna isso desde o fix anterior).
- Adicionar bloco **"Já capturado no cadastro"** no topo da Step 1 (Identidade), read-only: chip de logo (ou avatar de iniciais), Nome, Nicho, Instagram (link), Cor da marca (swatch). Evita a percepção de "form vazio" quando na verdade parte da identidade já existe.
- Manter o restante do fluxo idêntico; nada de novos campos editáveis nesse bloco.

### 4) Aba "Identidade" (Cérebro da Marca) — completude visual

Arquivo: `src/components/brand-hub/briefing-workspace.tsx` (`IdentidadeTab`)

- O bloco "Cadastro rápido" já existe (Nome/Nicho/Instagram/Cor). Adicionar preview do **logo** (thumb 40×40 quando `client.logo_url` existir) e do **contato principal** (`contact_name` + `contact_email`, ambos opcionais).
- Nenhuma mudança em campos editáveis; só reflete o que já foi capturado.

### 5) Compatibilidade e regressões

- Manter o schema `texto` opcional para não quebrar chamadas antigas em cache do navegador.
- Nenhuma migração de banco.
- Nenhum ajuste em `waitUntil`/timeout do worker nesta rodada — é o próximo passo depois desta correção.

## Detalhes técnicos

- `getBrandHub` já expõe `socials` e demais campos de `clients` (fix da rodada anterior). Não precisa alterar server function.
- Composição de `raw_text` no servidor deve reutilizar a mesma ordem/labels que `buildStrategyBriefing` usa hoje (Marca / Nicho / Tom / …) para não regredir a qualidade do prompt já validado.
- `runStructured` do pipeline continua igual; só a origem do `input.texto` muda.

## O que fica de fora desta rodada

- Correção do timeout do worker (`waitUntil` + `AbortController` + heartbeat + quebra do pipeline em jobs menores) — plano separado.
- Correção do KPI "Consumo de IA" que agrega marca inteira em vez de cliente — plano separado.
- Unificação dos modelos `gemini-2.5-*` vs `gemini-3.x` entre pipeline automático e regeneração manual — plano separado.

## Critério de aceite

1. Criar um cliente novo pelo modal, pular todo o wizard e clicar "Gerar Inteligência com IA": o job roda com contexto (Nome + Nicho + Instagram + Cor + qualquer coisa em `brand_hub`), sem enviar `texto` do browser.
2. No wizard, Step 1 mostra bloco "Já capturado no cadastro" com logo/nome/nicho/instagram/cor.
3. Na aba Identidade, o mesmo bloco lista também logo e contato principal quando existirem.
4. Nenhuma referência a `buildBriefing`/`buildStrategyBriefing` no front após o patch.