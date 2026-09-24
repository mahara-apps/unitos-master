# Auditoria — Provisionamento, Atualização e Publicação de Instalações

Auditoria somente leitura. Nenhum arquivo de aplicação, dado ou configuração foi alterado; nenhum comando de execução real (SQL remoto, deploy, retry) foi disparado. Todas as referências abaixo são `arquivo:linha` no estado atual do repositório.

## 1. Visão geral do fluxo

Provisionamento/atualização é orquestrado exclusivamente pela instalação **MASTER** (`src/lib/installation/manager.server.ts:20-31` — `detectMaster`/`assertMasterInstallation`, fail-closed fora do MASTER). O motor de execução (`src/lib/installation/automation.server.ts`, 7767 linhas) roda em etapas (`AUTOMATED_PROVISION_PLAN`, `src/lib/installation/automation-contract.ts:442-460`): `supabase → code → deploy_link → database → storage → seeds → secrets → deploy → brain → cron`, seguido de validação final. Cada etapa é persistida em `installation_operations` via `checkpoint_installation_operation` (RPC chamada em `src/lib/installation/runner.server.ts:353-364`).

## 2. Como as variáveis VITE_SUPABASE_* / SUPABASE_* são gravadas

- O **plano** de variáveis é montado por `buildDeployEnvPlan` (`src/lib/installation/automation-contract.ts:368-434`), que grava simultaneamente o par server/client:
  - `SUPABASE_URL` / `VITE_SUPABASE_URL` (linhas 396-397)
  - `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` (398-399)
  - `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` (400-401)
  - `SUPABASE_SERVICE_ROLE_KEY` (402, `sensitive: true`, sem par VITE — corretamente nunca exposto ao client)
  - Guard-rail: se URL/ref contiver referência ao MASTER, o plano inteiro é recusado (`containsMasterReference`, linhas 386-389) — nenhuma variável é gravada.
  - Guard-rail: qualquer entrada vazia recusa o plano inteiro (linha 430-431) — evita gravar env parcial/inconsistente.
- A **gravação real** ocorre via Vercel Management API, método `setEnv` (`src/lib/installation/automation.server.ts:3764-3793`): `POST /v10/projects/{id}/env?upsert=true`, aplicando em `target: ["production","preview","development"]`. `upsert=true` faz a Vercel substituir o valor existente da mesma chave (não duplica linhas de env).
- A chamada a `setEnv` só ocorre uma vez por operação graças ao checkpoint `provisionEnvApplied` (`automation.server.ts:5393-5407`): se o estágio já reportou `provisionEnvApplied: true`, o envio é pulado e o resultado é sintetizado (`{ ok: true, applied: plan.entries.length }`), evitando reenviar segredos regenerados/re-hasheados em cada retry.
- Comentário explícito no código (linha 5419-5423) documenta uma limitação real: **gravar as variáveis não republica o app** — é necessário um deployment novo para o frontend consumir os valores atualizados; isso é tratado nas etapas seguintes de deploy/commit (a partir da linha 5424).

## 3. Preflight: obrigatório ou opcional?

**Achado central de risco: o preflight NÃO é um gate obrigatório no caminho de execução automatizado.**

- `evaluatePreflight` (`src/lib/installation/preflight-contract.ts:142-265`) é um módulo puro, bem desenhado (nunca retorna PASS na ausência de pré-condição — linhas 8-9, 259-264), mas:
  - É invocado apenas em teste (`tests/installation-preflight.unit.test.ts`) e em nenhum ponto de `automation.server.ts`, das rotas (`src/routes/api/public/installations/execute.ts`, `.../report.ts`) ou do runner. Confirmado por busca: `rg -n "evaluatePreflight" src` só retorna a própria definição.
  - `INSTALLATION_SECRET_VARS` de `preflight-contract.ts` é reaproveitado por `report-contract.ts:12` apenas para a lista de padrões de redação de segredo no canal de progresso (`report-contract.ts:47-57`), não para bloquear a operação.
  - Existe também `supabase/install/preflight.sh` (script standalone, `supabase/install/preflight.sh:1-40`), explicitamente documentado como somente leitura e de uso manual pelo operador (`export ... ; bash supabase/install/preflight.sh`) — não é chamado automaticamente pelo runner do MASTER nem pelas rotas públicas.
- Em vez de um preflight formal único, as garantias equivalentes estão **espalhadas e implícitas** dentro de `automation.server.ts`, cada uma checada na hora de cada etapa (ex.: isolamento do MASTER checado ad hoc em vários pontos via `containsMasterReference`, comparação de versão do código-fonte vs `MASTER_RELEASE_VERSION` em `automation.server.ts:4703-4720`, gate de credenciais BYOK em `credentials.server.ts:446-453`). Isso funciona, mas significa que **não existe um único ponto de decisão PASS/BLOCKED/FAIL antes de iniciar a operação** — cada falha é descoberta apenas quando a etapa correspondente já começou a rodar, tornando o preflight formal (`preflight-contract.ts`) um artefato **de referência/teste**, não um gate ativo.

## 4. Checkpoints, lease/fencing e retries — como evitam duplicação

- **Lease com fencing token**: cada operação tem `lease_owner`, `lease_expires_at`, `fencing_token` (colunas confirmadas em `OperationRow`, `runner.server.ts:148-164`; migrações que criam essas colunas incluem `supabase/migrations/20260921135359_...sql` e `20260921223018_...sql`). `heartbeatOperation`/`assertOperationLease` (`runner.server.ts:186-201`) garantem que só o dono corrente do fencing token pode continuar escrevendo — dois workers não conseguem aplicar progresso da mesma operação simultaneamente (`InstallationLeaseLostError`, linha 169-174).
- **Checkpoint por etapa**: `applyProgressReport` (`runner.server.ts:328-366`) sempre **relê a linha persistida** antes de mesclar o novo passo (comentário nas linhas 335-337 explica que aplicar sobre uma cópia em memória apagaria etapas concluídas). Isso é o mecanismo central de "resume sem duplicar": o step recém-concluído nunca é re-executado porque o estado real vem do banco, não da memória do processo.
- **Stage progress interno de longa duração**: dentro de `automation.server.ts`, cada sub-etapa cara (commit de código, envio de env, deployment) grava flags idempotentes via `saveStageProgress` (definição em `automation.server.ts:4130`, dezenas de chamadas ao longo do arquivo, ex. `4684`, `4724`, `5406`) — cada uma delas é checada antes de repetir trabalho (`stage.provisionEnvApplied` em `5393`, `stage.codeSourceSha` em `4736-4737`, etc.). Isso é o que impede, por exemplo, reenviar variáveis de ambiente ou recriar o commit do GitHub em cada retry.
- **Backoff exponencial com jitter**: `retryOperation` (`runner.server.ts:270-293`) calcula delay `min(750, 15*2^(tentativa-1))` mais até 20% de jitter, limitado a 900s, persistindo `attempt_count`/`max_attempts` (campos em `OperationRow`, linha 160-161) — impede tempestade de retries e permite limite duro de tentativas.
- **Yield (sem consumir tentativa)** vs **retry (consome tentativa)**: `yieldOperation` (`runner.server.ts:229-242`) e `retryOperation` (`270-293`) são operações RPC distintas — falha transitória do próprio MASTER usa `deferOperation` (`244-267`), que não conta como tentativa "gasta" contra o destino, separando falha do orquestrador de falha do ambiente-alvo.
- **Idempotência de publicação de código**: `code.publishSnapshot` reaproveita blobs já enviados via `stage.codeBlobs`/`codeSourceSha` (`automation.server.ts:4735-4737`, `onCheckpoint` grava blob map incrementalmente nas linhas ~4746-4751) — um retry após timeout de rede continua do ponto do último blob confirmado, sem reenviar o repositório inteiro.
- **Finalização com evidência obrigatória**: `finalizeOperation` (`runner.server.ts:381-…`) só marca sucesso (`acceptedSuccess`) se **todas** as etapas esperadas do contrato (`stepsFor(kind)`) estiverem presentes e com estado `done` (linhas 402-411) — uma operação que "parece OK" mas está com etapa faltando é tratada como incompleta, nunca promovida.
- **Versão só é promovida em operação completa**: `versionForCompletedOperation` (`runner.server.ts:177-184`) recusa promover versão para `kind === "validate"` ou quando `acceptedSuccess` é falso — separa comprovar saúde de publicar código.

## 5. Versões antigas em risco

- `MASTER_RELEASE_VERSION` atual = `"1.4.39"` (`src/lib/installation/manager-contract.ts:24`).
- Existe um mecanismo dedicado de reconciliação de **instalações legadas** (`src/lib/installation/legacy-reconciliation.ts`), com um contrato fixo de 85 posições de migration (`LEGACY_RECONCILIATION_LAST_POSITION = 85`, linha 49) e uma classificação por posição em três categorias (linhas 27-45):
  - `canonical_state` — migração compatível diretamente;
  - `partial_compatibility` — parcialmente compatível, requer atenção;
  - `external_checkpoint_required` — posições **21, 42, 52, 56, 66, 82, 83 são `partial_compatibility`**, e **72, 74, 85 exigem checkpoint externo** (`external_checkpoint_required`) — ou seja, instalações que pararam nessas posições **não podem ser promovidas automaticamente sem evidência externa adicional**; são as versões de maior risco de divergência silenciosa.
  - A reconciliação exige cobertura mínima até a posição 85 (linhas 109-111) — instalações com menos migrações aplicadas que isso são recusadas explicitamente, não promovidas por omissão.
- Plano já registrado (`'.lovable/plan/atualização-segura-de-instalações-legadas-sem-manifesto-2026-09-17.md'`) documenta que instalações **sem manifesto de pacote** (variante legada, antes do manifesto de 85 blocos com SHA-256 individual) precisam de uma "recuperação determinística" que só é aceita quando versão, SHA-256 global, contagem de blocos, conteúdo SQL e identidade da operação batem exatamente com o pacote Client oficial embarcado no MASTER — falha fechada em qualquer divergência. Isso confirma que **instalações antigas pré-manifesto são a categoria de maior risco** hoje mapeada pela própria equipe, e a correção descrita nesse plano é o remédio já desenhado (mas cuja aplicação real não foi verificada nesta auditoria — não executamos nada).
- `installations.pinned_release` é a fonte de verdade da versão instalada (`runner.server.ts:438-439`, fallback para `current_version` "apenas legado") — instalações antigas que só têm `current_version` preenchido (sem `pinned_release`) dependem do fallback legado; se esse dado estiver dessincronizado da realidade do deploy, a UI pode reportar versão desatualizada. Recomenda-se auditoria adicional (fora de escopo desta leitura) para contar quantas linhas de `installations` têm `pinned_release IS NULL`.

## 6. Isolamento MASTER-first / multi-tenant

- Credenciais por instalação têm precedência sobre env global do MASTER (`credentials.server.ts:14-16`, `438-478`), e instalações BYOK **nunca herdam** token de gestão Supabase do MASTER mesmo em falha de leitura do cofre (comentário linhas 14-16, implementação 446-453) — isolamento fail-closed confirmado.
- Segredos gerados por instalação (`CRON_SECRET`, `BRAND_CREDENTIALS_SECRET`, `META_STATE_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`) são gerados **uma única vez** e reaproveitados via compare-and-set otimista (`ensureInstallationSecrets`, `credentials.server.ts:311-347`, RPC `compare_and_set_installation_generated_secrets`) — rotação é sempre uma ação explícita separada (`rotateInstallationSecret`, linhas 355-376), nunca implícita durante um retry de provisionamento. Isso é coerente com a regra de não invalidar segredos em repouso.

## 7. Riscos identificados (resumo)

1. **Preflight não é gate ativo.** `evaluatePreflight`/`preflight.sh` existem como validação determinística de pré-condições, mas nenhum ponto do fluxo real (`execute.ts`, `automation.server.ts`, `runner.server.ts`) os invoca antes de iniciar a operação. As garantias equivalentes existem, mas fragmentadas por etapa — sem um relatório único PASS/BLOCKED/FAIL prévio, visível ao operador antes de consumir uma tentativa.
2. **Instalações legadas sem manifesto / em posições `external_checkpoint_required` (72, 74, 85)** dependem de reconciliação especial ainda descrita apenas em plano — risco de divergência silenciosa entre o que o banco tem e o que a versão informada assume.
3. **Fallback `current_version`** em `finalizeOperation` (`runner.server.ts:438-439`) é aceito como legado; instalações que nunca tiveram `pinned_release` setado corretamente podem exibir versão desatualizada/incorreta na UI sem erro visível.
4. **Nenhuma ferramenta liga preflight.sh ao painel do MASTER** — hoje é um script bash separado, operado manualmente; se esquecido, o operador só descobre bloqueios durante a execução real (consumindo tempo/tentativas).

## 8. Ondas seguras propostas (sem execução)

- **Onda 1 (somente leitura/instrumentação)** — expor no painel de instalações o resultado de `evaluatePreflight` como relatório informativo antes de habilitar o botão "Provisionar"/"Atualizar", sem bloquear tecnicamente ainda (feature-flag), para calibrar falsos positivos contra o parque real de instalações.
- **Onda 2 (gate mandatório opcional por flag)** — tornar `evaluatePreflight` um gate real, chamado em `execute.ts` antes de criar a operação, mas atrás de uma env var (`UNITOS_ENFORCE_PREFLIGHT=1`), permitindo rollback instantâneo se aparecer falso bloqueio em produção.
- **Onda 3 (levantamento read-only do parque legado)** — antes de qualquer código, rodar consulta somente leitura em `installations`/`installation_operations` para contar quantas instalações estão em posições `external_checkpoint_required` (72/74/85) ou sem `pinned_release`, para dimensionar o risco real antes de habilitar a reconciliação automática do plano já desenhado.
- **Onda 4 (gate mandatório definitivo)** — após dados da Onda 3 confirmarem baixo risco de falso bloqueio, remover a flag da Onda 2 e tornar o preflight sempre obrigatório, com mensagens BLOCKED/FAIL exibidas no mesmo card de operação (reaproveitando `sanitize()` já usado em `runner.server.ts:369-378` para nunca vazar segredo).
- Em nenhuma onda alterar `checkpoint_installation_operation`, `finalize_installation_operation`, lease/fencing ou o pacote canônico de 85 blocos — esses mecanismos já atendem ao objetivo de evitar duplicação e devem ser preservados intactos.

Nenhuma alteração foi feita no código, banco, configuração ou publicação como parte desta auditoria.
