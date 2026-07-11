
## Contexto

Hoje temos apenas o kanban de **conteúdo** em `/content` (posts editoriais, tabela `posts` + `content_pipelines`). A rota `/pipelines` ("Patient Journey / Jornada do Paciente") não existe, e o domínio descrito ("deals", "R$", "practitioner", "WhatsApp") é um **CRM de negócios/clientes**, não conteúdo. Antes de codar, preciso alinhar 3 pontos que mudam totalmente o escopo.

## Perguntas de alinhamento

1. **Domínio dos dados** — é um novo módulo de CRM (deals/leads) paralelo ao kanban de conteúdo, ou você quer *substituir* o `/content` por este layout?
   - Se novo módulo: precisamos de schema novo (`pipelines`, `pipeline_stages`, `deals`) escopado por `client_id`, com RLS, seed inicial "Jornada do Paciente" e item no sidebar em "Clinical".
   - Se substituir: reaproveitamos `content_pipelines` + `posts` renomeando conceitos — mais rápido, mas perde semântica clínica.

2. **"Patient Journey" fixo ou multi-vertical?** O NexusFlow atende agências — clínicas são só um caso. Faz sentido criar templates de pipeline por vertical (Clínica, E-commerce, SaaS…) ou mantemos genérico e o nome/estágios são livres por Account?

3. **Localização** — regra atual é PT-BR em toda a plataforma. Confirmo que os rótulos padrão vão como "Jornada do Paciente / Lead / Consulta / Avaliação / Tratamento / Retorno" (não "Patient Journey / Consultation…")?

## Plano proposto (assumindo módulo novo de CRM, multi-vertical, PT-BR)

### 1. Schema (migração Supabase)
```
crm_pipelines(id, client_id, brand_id, name, description, is_default, created_at, updated_at)
crm_pipeline_stages(id, pipeline_id, label, color, position, created_at)
crm_deals(id, pipeline_id, stage_id, client_id, brand_id,
          contact_name, contact_initials, service, owner_name,
          amount_cents, currency, whatsapp, status, position,
          created_at, updated_at, created_by)
```
- GRANTs para `authenticated` + `service_role`.
- RLS via `has_brand_access(brand_id)` (padrão já usado em `posts`).
- Seed: template "Jornada do Paciente" com 5 estágios (Lead branco, Consulta azul, Avaliação roxo, Tratamento laranja, Retorno verde) criado on-demand na primeira visita.

### 2. Server functions (`src/lib/crm.functions.ts`)
- `listPipelines`, `getPipelineBoard(pipelineId)`, `createPipeline`, `updateStage`, `createDeal`, `updateDeal`, `moveDeal(dealId, toStage, position)`, `deleteDeal`.
- Todas com `requireSupabaseAuth` + validação Zod + checagem de brand.

### 3. Rota `/pipelines`
- `src/routes/_authenticated/pipelines.tsx` (layout + Outlet opcional).
- Header via `PageHeaderProvider`: título "Jornada do Paciente" + descrição + ações (view toggle, busca, filtros, sort, menu).
- Sub-barra de filtros com pills flat (Ordenação, Intervalo).
- Board horizontal com lanes envelopadas conforme spec:
  - Container `rounded-xl border border-border/60 bg-muted/30`
  - Header interno: dot colorido + nome + valor total + contador + `•••`
  - Cards `bg-background border-border/70 hover:border-border`
    - avatar de iniciais, nome, serviço, responsável, valor, data, ícones (WhatsApp, status)
  - Footer sticky com botão ghost "+ Novo negócio"
- DnD com `@dnd-kit` (mesma engine do `/content`), scroll horizontal suave (`overflow-x-auto snap-x`).

### 4. Sidebar
- Novo bloco "Clínico" (rotulado dinamicamente por vertical) no `app-sidebar.tsx`, contendo "Jornada do Paciente" com ícone `Stethoscope`/`Route`.
- Mantém "Conteúdo" separado em "Marketing".

### 5. Design tokens
- Reuso 100% dos tokens OKLCH atuais (`--muted`, `--border`, `--background`). Sem hex fixo `#121214` / `#0a0a0c` — mapeamos para tokens equivalentes para funcionar em light/dark.

## Fora de escopo desta primeira entrega
- Automação/triggers entre estágios
- Relatórios de conversão
- Importação CSV/integração com WhatsApp real (apenas ícone/flag)

---

**Responda 1, 2 e 3 e eu executo direto.** Se quiser só "faz aí do jeito mais sênior", assumo: **módulo novo, multi-vertical com template clínico como seed, PT-BR**.
