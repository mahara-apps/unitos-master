# Painel de SLA em Configurações

Hoje o SLA existe apenas por coluna do Kanban (`content_pipeline_stages.sla_days`), editado dentro do modal de configuração da coluna, sem visão consolidada nem SLA para projetos, equipe ou agentes de IA. O objetivo é criar um painel central em `Configurações → SLA` onde o gestor define regras em nível global (workspace/marca) e sobrepõe por projeto, e onde as regras existentes de coluna passam a ser gerenciadas junto com as novas.

## Escopo das quatro dimensões

- **SLA de Colunas (Content Pipeline)**: dias por estágio antes de disparar aviso de atraso. Já existe (`sla_days` em `content_pipeline_stages`) — só passa a ser editável também no painel central, mantendo o editor atual da coluna.
- **SLA de Projetos**: prazo em dias entre criação/kickoff de um `project_jobs` e sua conclusão. Novo.
- **SLA de Equipe (por usuário/role)**: tempo máximo esperado para um responsável agir em uma tarefa atribuída (primeira resposta / conclusão). Novo.
- **SLA por Agente de IA**: tempo máximo esperado para um `ai_jobs` (por `agent_key`) sair de `pending/running` para `succeeded`. Novo.

Todas as dimensões suportam:
- Valor **global** (por marca).
- **Override por projeto** (quando aplicável) e por estágio (colunas já são por-pipeline).
- **Ativar/desativar** (mesmo padrão de `sla_days = null`).

## Modelagem (nova tabela)

Uma única tabela `sla_rules` cobre as quatro dimensões, permitindo hierarquia global → projeto sem inflacionar schema:

```text
sla_rules
  id uuid pk
  brand_id uuid not null (FK brands)
  scope text not null   -- 'stage' | 'project' | 'user_role' | 'agent'
  scope_ref text        -- stage_id | project_id | role | agent_key (null = default global)
  project_id uuid null  -- override por projeto (só quando scope != 'project')
  target_hours integer not null check (> 0)
  is_active boolean default true
  updated_by uuid, updated_at timestamptz default now()
  unique (brand_id, scope, coalesce(scope_ref,''), coalesce(project_id::text,''))
```

- RLS: membros do brand leem; managers/owners/super_admin escrevem (padrão já usado em `brand_members` + `has_role`).
- GRANTs padrão (`authenticated`, `service_role`).
- Para colunas mantemos `content_pipeline_stages.sla_days` como fonte de verdade — o painel apenas escreve nele via mutation existente. Registros `scope='stage'` na `sla_rules` ficam **desabilitados** nesta fase para evitar duplicidade; o painel edita o campo original.

## Servidor (`src/lib/sla.functions.ts`)

- `listSlaOverviewFn`: retorna, para a marca ativa, arrays de `stages`, `projects`, `users`, `agents` com o SLA vigente (herdando global se sem override).
- `upsertSlaRuleFn`: valida com Zod, aplica `has_role(owner|manager)` ou `is_super_admin`, faz upsert em `sla_rules`.
- `deleteSlaRuleFn`: remove override (fallback ao global).
- `updateStageSlaFn`: proxy da mutation já existente de estágio (para o painel gravar `sla_days`).

Todas com `.middleware([requireSupabaseAuth])` e escopadas por `brand_id` do contexto.

## Cron / notificações

Atualizar `src/routes/api/public/cron/sla-check.ts` para, além do check de estágios já existente, varrer:
- `project_jobs` sem conclusão passando do `target_hours` global/override → notificação `sla_overdue` para responsável + `sla_overdue_manager` agregada.
- `tasks` atribuídas paradas > `target_hours` do SLA de equipe.
- `ai_jobs` em `running/pending` > `target_hours` do SLA de agente.
Reaproveita `notification_kind` existente com `entity_kind` no payload para diferenciar. Idempotência mantida pela janela de 6h já usada.

## UI

### Rota nova `src/routes/_authenticated/settings.sla.tsx`
- Adicionar aba **"SLA"** (ícone `Timer`) em `TABS` de `settings.tsx`.
- Layout com quatro cards/abas internas: **Colunas**, **Projetos**, **Equipe**, **Agentes**.
- Cada aba: tabela com nome, SLA atual (input em horas + botão salvar), toggle ativo, coluna "Origem" (Global vs Override).
- Header do card com um campo "Padrão global" (aplica a todos os itens sem override).
- Aba **Projetos** permite escolher projeto e definir override; aba **Colunas** lista estágios por pipeline e grava em `content_pipeline_stages.sla_days` (compat com editor atual).

### Widget de override contextual
- Em `/projects/$id` (drawer do job), adicionar um pequeno bloco "SLA deste projeto" reaproveitando `upsertSlaRuleFn` — atalho para não precisar ir até Configurações.

## Permissões
- Leitura: qualquer membro do brand.
- Escrita: `owner`, `manager`, `is_super_admin` (`src/lib/permissions.ts` já expõe helpers).
- Cliente/external roles não veem a aba (gate no `TABS` de settings via `useHasRole`).

## Entregáveis
1. Migration com `sla_rules` + RLS + grants (não modifica `content_pipeline_stages`).
2. `src/lib/sla.functions.ts` (list/upsert/delete + proxy de estágio).
3. `src/routes/_authenticated/settings.sla.tsx` com as quatro abas.
4. Atualização de `src/routes/_authenticated/settings.tsx` para incluir a aba.
5. Atualização de `src/routes/api/public/cron/sla-check.ts` para cobrir projetos, tarefas e ai_jobs.
6. Bloco de SLA no drawer de projeto (override rápido).

## Fora do escopo (fase posterior)
- Dashboard analítico de cumprimento de SLA (%) — o `slaSnapshotFn` já existe; expor gráfico fica para depois.
- SLAs escalonados (ex.: primeira resposta vs. resolução) — hoje só um `target_hours` por regra.
- Notificações em canais externos (e-mail/WhatsApp) além do bell.
