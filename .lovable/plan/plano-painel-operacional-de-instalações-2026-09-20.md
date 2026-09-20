# Plano — painel operacional de instalações

## Estado local confirmado

- A versão canônica local é **1.4.18** em `src/lib/installation/manager-contract.ts`, sincronizada com `supabase/baseline-snapshot/tools/delta_version.txt`.
- Os manifests locais `supabase/master/bootstrap-control-plane.json` e `supabase/master/control-plane-contract.json` também declaram 1.4.18 e registram os hashes dos atos de freeze, executor determinístico e promoção.
- O estado realmente publicado não pode ser provado apenas pelo repositório. O mecanismo existente `getMasterVersionFn` compara o commit mais recente do deploy Master com a versão contida naquele commit e retorna `masterPublished`, `repoRelease`, `commitSha` e erros, sem publicar nada.
- O painel já existe em `/admin/instalacoes` e `/admin/instalacoes/$id`. A tela detalhada já usa as funções duráveis de provisionamento, validação, atualização e retomada, com polling enquanto há operação viva.
- O executor permanece centralizado em `runner.server.ts` e `resume-worker.server.ts`; as ações administrativas permanecem em `manager.functions.ts`. A implementação não criará outro executor nem repetirá regras de estado, retry, lease, fencing ou checkpoints.

## Implementação proposta

### 1. Separar a apresentação operacional da tela detalhada

Extrair da rota detalhada o bloco de operação ativa e a aba de execuções para componentes pequenos, mantendo na rota as queries, mutações e confirmações críticas.

O painel mostrará, a partir do mesmo registro durável:

- operação ativa, tipo, estado e progresso real;
- etapa atual e lista de etapas persistidas;
- último sinal recebido e indicação de operação stale usando os helpers existentes;
- checkpoint de migration já retornado pelo servidor;
- resumo e motivo da falha sem transformar ausência de evidência em sucesso;
- histórico recente com distinção entre execução, nova tentativa agendada, bloqueio, falha, cancelamento e conclusão;
- ações já existentes de provisionar, validar, atualizar, tentar novamente e cancelar, respeitando os mesmos diálogos de confirmação e guards.

### 2. Expor somente a telemetria durável necessária

Ampliar a leitura de `getInstallationFn`, sem adicionar qualquer escrita, para devolver campos operacionais já persistidos e seguros para o painel:

- `workflow_version`, `attempt_count` e `next_attempt_at`;
- `heartbeat_at`, `lease_expires_at` e presença de lease, sem expor identificador sensível do worker;
- `fencing_token` apenas como evidência técnica da execução;
- tentativas recentes da operação, com estado, sequência, início/fim e erro sanitizado;
- checkpoints recentes de migration, preservando o modelo atual e sem inferir conclusão ausente.

A consulta continuará protegida por Master + Super Admin e reutilizará `mapOperation`, `operationRuntimeState`, `operationPollInterval` e os contratos atuais.

### 3. Tornar o estado publicado visível e fail-closed

Reaproveitar `getMasterVersionFn` no cabeçalho operacional para distinguir:

- versão canônica local;
- versão encontrada no commit publicado;
- commit publicado;
- publicação confirmada, divergente ou indeterminada.

Quando GitHub ou Vercel não fornecerem evidência, o painel exibirá **indeterminado** e manterá UPDATE bloqueado pela regra existente. Nenhum endpoint, deploy ou consulta remota adicional será criado.

### 4. Preservar integralmente os fluxos atuais

- Não alterar `runner.server.ts`, `resume-worker.server.ts`, rotas públicas de execução/relato/cron ou SQL do executor, salvo se um teste revelar incompatibilidade estritamente de tipagem da leitura.
- Não criar uma nova rota paralela para instalação.
- Não mover confirmação, RBAC, freeze guard, criação de operação ou execução para o navegador.
- Não permitir edição manual de status, lease, heartbeat, fencing, checkpoints ou versão.
- Manter os formulários de cadastro, acessos, saúde, versões e suspensão como estão.

## Arquivos a ajustar

- `src/routes/_authenticated/admin.instalacoes.$id.tsx`
  - manter queries/mutações e compor os novos blocos do painel;
  - remover apenas a marcação visual extraída, sem mudar comandos ou confirmações.
- `src/routes/_authenticated/admin.instalacoes.index.tsx`
  - apresentar o estado publicado já retornado por `getMasterVersionFn`, com estados confirmado/divergente/indeterminado.
- `src/lib/installation/manager.functions.ts`
  - ampliar exclusivamente a leitura de detalhes e o mapeamento seguro de operações/tentativas.
- `src/lib/installation/manager-contract.ts`
  - acrescentar tipos e helpers puros de apresentação para telemetria durável, sem duplicar regras do executor.
- `src/components/installations/operation-views.tsx`
  - preservar primitives existentes e acomodar os campos duráveis comuns.

## Arquivos a criar

- `src/components/installations/installation-operation-panel.tsx`
  - operação ativa, progresso, heartbeat/retomada, checkpoint e ações recebidas por props.
- `src/components/installations/installation-operation-history.tsx`
  - histórico e tentativas, usando badges e formatadores existentes.
- `src/components/installations/master-published-state.tsx`
  - estado local/publicado/commit, incluindo apresentação fail-closed de indisponibilidade.
- `tests/installation-panel-view-model.unit.test.ts`
  - regressões da projeção visual: ativa, retry agendado, stale, terminal, histórico ambíguo e publicação indeterminada.

Não será criada nova server function, rota, tabela, migration, secret ou mecanismo de execução.

## Validação local

1. Testes focados dos helpers e componentes do painel.
2. Regressões existentes de lifecycle, progresso, versão, leituras ambíguas, freeze e automação.
3. Verificação visual local das telas de lista e detalhe em desktop e mobile, sem disparar ações.
4. `bun run master:check`, typecheck com `bunx tsgo --noEmit`, lint dos arquivos alterados e build.
5. Aplicar o fluxo MASTER-first local: regenerar o delta, atualizar `delta_version.txt` e `MASTER_RELEASE_VERSION` para a mesma nova versão, conferir o pacote/manifesto e manter `verify-installation.sql` coerente. Como não haverá objeto de banco novo, nenhuma checagem estrutural adicional será inventada.

## Fora do escopo

- NEW, UPDATE, recovery, provisionamento ou retomada real.
- Migrations locais ou remotas de banco.
- Alteração da Apex pending ou de qualquer histórico.
- Mudança de cron, freeze, secrets, GitHub, Vercel ou Supabase.
- Publicação automática; qualquer publicação exigirá autorização explícita posterior.
