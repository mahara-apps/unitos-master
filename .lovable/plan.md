
# 7. Jornada do Cliente — Gestão da Conta

Nova aba **"Gestão"** dentro do perfil do cliente (`/customers/$customerId`), ao lado de Visão geral, Briefing, Canais e Cadastro. Concentra dados comerciais, jornada em pipeline e automação de projetos padronizados.

## Escopo desta entrega

Entrega o núcleo do módulo (informações + jornada + automação) sem os relatórios de longo prazo — a base de dados já fica pronta para eles.

### 1. Informações da conta (bloco superior)
Cartão editável (só admin/manager) com:
- Valor mensal do contrato (BRL)
- Margem (%) — opcional
- Responsável pela conta (usuário do workspace)
- Data de início do contrato
- Data de renovação prevista
- Status contratual: `ativo`, `pausado`, `encerrado`
- Notas internas (markdown curto)

KPIs derivados no topo: **MRR do cliente**, **Tempo de casa**, **Dias até renovação**.

### 2. Jornada (pipeline horizontal)
Timeline com 5 estágios canônicos:

```text
Onboarding → Ativação → Operação → Expansão → Renovação
```

- Estágio atual destacado; anteriores marcados como concluídos com data.
- Botão "Mover para próximo estágio" + menu para pular/voltar (admin).
- Ao mover: registra evento em `client_journey_events` (from_stage, to_stage, moved_by, moved_at, note opcional) e dispara evento no Brain (`client.journey.changed`).
- Ao entrar em um estágio que tem template de projeto vinculado → dialog:
  > "Deseja criar o projeto de Onboarding para este cliente?"
  Confirmando, chama `createProjectFromTemplate` (já existe) com o template mapeado, prefixando o nome com o cliente.

### 3. Automação de projetos por estágio
Reaproveita `project_templates` + `project_template_tasks` existentes. Adiciona mapeamento **estágio → template** por brand (configurável em Configurações → Projetos, fora do escopo visual desta entrega; usa defaults se não configurado).

Cada template pode ter tarefas agrupadas por área (Comercial, Financeiro, Atendimento, Social Media, Design, Performance) usando o campo `category` já existente em `project_template_tasks`.

### 4. Histórico da jornada
Abaixo do pipeline, lista cronológica dos eventos (quem moveu, quando, para qual estágio, projeto criado). Base para os relatórios futuros de cohort/tempo médio/churn.

---

## Detalhes técnicos

### Migração (Supabase)
- `ALTER TABLE public.clients ADD COLUMN` para: `monthly_contract_value numeric(12,2)`, `margin_percent numeric(5,2)`, `contract_start_date date`, `contract_renewal_date date`, `contract_status text default 'ativo'`, `internal_notes text`, `journey_stage text default 'onboarding'`.
- Nova tabela `public.client_journey_events` (client_id, brand_id, from_stage, to_stage, note, project_id nullable, moved_by uuid, created_at) com GRANTs + RLS por brand membership + trigger `updated_at`.
- Nova tabela `public.brand_journey_stage_templates` (brand_id, stage text, project_template_id) — mapeamento opcional estágio→template.
- RLS: leitura/escrita apenas para membros da brand; escrita nos campos comerciais restrita a `admin`/`manager` via policy usando `has_role`/brand role.

### Server functions (novo arquivo `src/lib/client-journey.functions.ts`)
- `getClientAccount({ clientId })` — retorna dados comerciais + estágio + histórico + template mapeado para o estágio atual.
- `updateClientAccount({ clientId, patch })` — valida role admin/manager.
- `moveClientJourneyStage({ clientId, toStage, note, createProject })` — atualiza `clients.journey_stage`, insere evento, opcionalmente chama `createProjectFromTemplate` e vincula `project_id` no evento. Registra no Brain.
- `listClientJourney({ clientId })` — histórico paginado.

Todas com `requireSupabaseAuth`.

### Frontend
- `src/routes/_authenticated/customers.$customerId.tsx`: adicionar tab `"gestao"` no array `ALL_TABS`, renderizar `<AccountManagementTab brandId clientId />`.
- Novos componentes em `src/components/customer/`:
  - `account-management-tab.tsx` (orquestrador)
  - `account-info-card.tsx` (formulário inline com autosave debounced, restrito por role via `useAccessRole`)
  - `journey-pipeline.tsx` (5 chips horizontais + progress + botão avançar)
  - `journey-move-dialog.tsx` (confirma movimentação + oferece criar projeto)
  - `journey-history.tsx` (timeline vertical)
- Query keys sob `["client-journey", clientId]`; invalidar após mutations.

### Permissões
- Leitura: qualquer membro da brand com acesso ao cliente (respeita `allowedClientIds` de `useAccessRole`).
- Edição de campos comerciais e movimentação de estágio: `admin` ou `manager` da brand. `user` vê tudo em modo read-only.

### Fora do escopo (fica para uma próxima etapa)
- Dashboards analíticos (tempo médio por estágio, cohort de retenção, churn) — a estrutura de `client_journey_events` já grava os dados necessários.
- Editor visual do mapeamento estágio→template em Configurações (usaremos defaults nesta entrega; seed inicial via migração).
- Alertas de renovação próxima no bell (fácil adicionar depois usando `contract_renewal_date`).

---

## Ordem de execução
1. Migração (schema + RLS + seed de templates padrão de Onboarding).
2. `client-journey.functions.ts` com as 4 server functions.
3. Componentes de UI + nova aba na rota do cliente.
4. Integração com `createProjectFromTemplate` existente.
5. Emissão de eventos para o Brain.
