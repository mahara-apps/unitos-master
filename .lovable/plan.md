
## Objetivo

Transformar a sub-aba "Documentos" do Cérebro da Marca em um **hub de contexto para IA**. O usuário sobe brandbook / manual de marca / apresentação; a IA lê, interpreta e sugere enriquecimentos campo-a-campo do briefing. Toda aplicação registra um snapshot **antes/depois** para medir ganho de contexto e completude.

## Escopo (só o que muda)

1. **Nova sub-seção** `documentos` no `StackedBrainLayout` (mesma nav lateral do Cérebro).
2. **Modal Premium de Upload** (drag&drop, múltiplos arquivos: PDF, DOCX, PPTX, imagens, TXT/MD, até 25 MB cada).
3. **Análise IA sênior** de cada documento com output estruturado por seção do briefing (missão, posicionamento, valores, tom, oferta, público, dores, desejos, do/don't, paleta, hashtags).
4. **Aplicar ao briefing** com diff **antes → depois** por campo (checkbox por sugestão, preserva o que o usuário já escreveu; opção "substituir" ou "complementar").
5. **Métricas de contexto**: KPIs "Documentos analisados", "Campos enriquecidos", "Δ Completude" (antes/depois em pontos %), "Última aplicação".
6. **Histórico de versões** do briefing (usa `brand_ai_versions`), permitindo reverter.

## Arquitetura

### Banco (migration)

Estender `public.client_documents`:
- `ai_status` text default `'idle'` — `idle | queued | running | done | failed`
- `ai_model` text
- `ai_error` text
- `extracted_text` text (texto bruto ou OCR, truncado a ~200 KB)
- `ai_summary` jsonb — objeto estruturado: `{ mission, positioning, values, tone_text, offer, price_range, differentials, objections, audience, journey, pain_points, desires, do_text, dont_text, hashtags[], palette[{label,hex}], keywords[], notes }` (todos opcionais).
- `analyzed_at`, `applied_to_briefing_at` timestamptz
- Índice `(brand_id, client_id, created_at desc)`
- Trigger `updated_at`

Nova tabela **opcional (reuso preferido)**: usa `brand_ai_versions` existente para snapshot do `brand_hub` antes de cada `apply` (kind = `briefing_snapshot`).

### Server functions e job (`src/lib/documents-ai.functions.ts` + `src/routes/api/jobs/analyze-document.ts`)

- `analyzeClientDocument({ brandId, clientId, documentId })` — enfileira um `ai_jobs` do tipo `analyze_document`.
- Worker HTTP (segue o padrão de `customer-pipeline` / `generate-ideas`):
  1. Baixa o arquivo do bucket via `supabaseAdmin`.
  2. Extrai texto:
     - PDF/DOCX/PPTX/imagem → `document--parse_document` equivalente server-side (usa Gemini multimodal via `LOVABLE_API_KEY` com `input_audio`/`file` blocks).
     - TXT/MD → leitura direta.
  3. Chama Gemini `flash` com prompt sênior ("você é diretor de branding, mapeie o documento nas seções do briefing…") + `Output.object(zodSchema)` estruturado.
  4. Grava `extracted_text`, `ai_summary`, `ai_status='done'`, `analyzed_at`.
- `applyDocumentToBriefing({ brandId, clientId, documentId, picks, mode })` onde `picks` = `{ field: 'merge'|'replace'|'skip' }`. Antes de patch, snapshot em `brand_ai_versions` (kind=`briefing_snapshot`, ref=documentId). Aplica no `brand_hub` respeitando `mode`.
- `revertBriefingSnapshot({ versionId })` — restaura snapshot.

### UI (`src/components/brand-hub/documents-tab.tsx` refatorado + novos)

- **Header da sub-aba** com 4 KPIs (docs analisados, campos enriquecidos, Δ completude, última aplicação).
- **Dropzone premium** (modal `UploadDocumentsDialog`) com preview de arquivos, barra de progresso e "iniciar análise ao subir" (checkbox default on).
- **Tabela de documentos** com status pill (`Aguardando`, `Analisando…`, `Pronto`, `Falhou`), botões `Ver leitura da IA`, `Aplicar ao briefing`, `Baixar`, `Excluir`, `Reanalisar`.
- **Drawer "Leitura da IA"** — 2 colunas:
  - Esquerda: sumário estruturado gerado (por seção).
  - Direita: **Antes / Depois** por campo do briefing — mostra valor atual do `brand_hub` × sugestão; select `Substituir | Complementar | Ignorar`; botão "Aplicar seleção" no rodapé.
- **Painel de histórico** com versões (`brand_ai_versions kind=briefing_snapshot`) com botão "Reverter".

### Integração no Cérebro

- Em `briefing-workspace.tsx` adicionar `{ id: "documentos", label: "Documentos & IA" }` no `BRAIN_SECTIONS` e renderizar `<DocumentsTab />` dentro de um `<BrainSection id="documentos">`.
- Após `applyDocumentToBriefing`, invalidar `brand-hub` (completude sobe → KPI Δ atualiza automaticamente).

## Segurança

- Todas as funções via `requireSupabaseAuth`; validação Zod.
- Worker roda com bearer do usuário; usa `supabaseAdmin` só para storage download.
- Limite: 25 MB por arquivo, 50 arquivos por cliente (soft-limit configurável).
- `ai_summary` nunca contém segredos; prompt instrui a ignorar tokens/credenciais.

## Fora de escopo

- OCR nativo para PDFs escaneados sem texto (Gemini multimodal cobre a maioria; se falhar, sinaliza `ai_error`).
- Comparação entre múltiplos documentos.
- Publicação do resumo no portal do cliente.

## Entregáveis (arquivos)

- Migration: colunas em `client_documents` + índice.
- `src/lib/documents-ai.functions.ts` (novo).
- `src/routes/api/jobs/analyze-document.ts` (novo).
- Refactor `src/components/brand-hub/documents-tab.tsx` (dropzone, KPIs, tabela, drawer).
- Novos: `src/components/brand-hub/upload-documents-dialog.tsx`, `src/components/brand-hub/document-ai-drawer.tsx`, `src/components/brand-hub/briefing-diff.tsx`.
- Edit `src/components/brand-hub/briefing-workspace.tsx` (adicionar seção `documentos` no `BRAIN_SECTIONS` + render).
