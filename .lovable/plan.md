# Execução controlada da recovery 1.4.14 para o ambiente Apex

## Escopo e separação obrigatória

Esta janela trata exclusivamente da recovery `20260919143000_recover_missing_legacy_reconciliation.sql` no Control-plane compartilhado `tkjbhttylouamqxnbfgv`.

- A recovery corrige o Control-plane; ela não altera o banco Client da Apex (`mvxvjsgfsmeyprefnbzc`).
- Nenhuma operação NEW, UPDATE, retry ou P0 será criada, retomada ou executada.
- Um UPDATE da Apex será avaliado apenas depois da validação pós-recovery e exigirá outra autorização explícita.
- Publicação e deploy ficam fora desta execução.

## Estado conhecido e pré-requisitos

### Evidência já aprovada

- Ensaio PostgreSQL isolado: aprovado, incluindo rollback integral, ACL/RLS, registro pela CLI e ledger final `0,1,1`.
- Artefatos locais e manifesto: conferidos; recovery SHA-256 `cd11b97d82765563a5fcd0161982baf89b37d2bbff019832df4a9a9c443fc058`.
- Supabase CLI exigida: exatamente `2.117.0`.
- Testes focados: 33/33; `master:check`: 110/110; typecheck, lint e build aprovados.
- Último preflight read-only: 16/16 PASS; os dois falsos FAIL do controle 7 foram eliminados sem reduzir as verificações.
- Ledger observado: 1.4.10 ausente, 1.4.11 presente uma vez, 1.4.14 ausente.
- Nenhuma operação ativa foi observada.

### Pré-requisitos que serão reconfirmados antes da escrita

1. Identidade exata do Control-plane e da conexão.
2. Mesmo manifesto, migration, preflight e hashes aprovados.
3. CLI 2.117.0 e formato de dry-run exatamente esperado.
4. Ledger ainda em `1.4.10=0, 1.4.11=1, 1.4.14=0`.
5. Dezesseis resultados `PASS` no preflight oficial, sem saída ausente ou extra.
6. Objetos da 1.4.10 integralmente ausentes; nenhum estado parcial.
7. 1.4.11 íntegra: assinatura, nomes/tipos/ordem/quantidade, ausência de overload, corpo, linguagem, retorno, propriedades, owner, ACL e dependências.
8. Nenhuma operação `pending`, `running` ou `retryable`, nenhuma lease válida e nenhum worker executando.
9. Backup concluído, identificável e restaurável antes de liberar a recovery.
10. Um único operador, uma única janela e nenhum outro processo de promoção ativo.

Qualquer divergência resulta em abortamento antes do `db push` real.

## Riscos identificados

| Risco | Tratamento |
|---|---|
| A recovery afeta o Control-plane compartilhado, não apenas a Apex | Congelamento global; nenhuma operação de qualquer instalação durante a janela |
| Divergência de versão da Apex: produção declara 1.3.76, Control-plane registra 1.3.71 e pin 1.3.72 | Não será corrigida na recovery; permanece para o gate separado de UPDATE |
| Apex permanece com `status=error` e `health=failing`, com falhas históricas de validação | Não bloqueia a estrutura da recovery; impede assumir aptidão automática para UPDATE |
| Há 27 steps `pending` ligados a operações já terminais | Tratados como resíduos históricos, não como trabalho ativo; qualquer lease/operação viva bloqueia |
| Pequena janela entre o último snapshot do ledger e a transação da CLI | Releituras após dry-run e imediatamente antes do push; janela sem outros escritores; abortar diante de drift |
| Pequena janela entre o último hash do staging e a abertura dos arquivos pela CLI | Staging privado, selo SHA-256 e validação imediata antes do push |
| Advisory lock é consultivo | Suspender todos os iniciadores; o lock protege apenas processos cooperantes e não substitui o congelamento |
| Falha depois do commit | Manter UPDATEs bloqueados; verificar imediatamente; avaliar restauração ou correção forward, nunca ajuste manual |

## Backup: mecanismo e evidência

### Mecanismo

Antes da recovery será criado um backup remoto consistente do banco do Control-plane pelo mecanismo nativo do provedor. Se o projeto tiver Point-in-Time Recovery habilitado, será registrado um ponto restaurável imediatamente anterior à janela. Caso contrário, será exigido um snapshot/backup completo concluído pelo provedor. Não será aceito apenas um export parcial de tabelas como backup principal.

Também será preservado um pacote de evidências read-only contendo:

- ledger completo e ordenado de migrations;
- catálogo e ACL dos objetos envolvidos;
- operações, tentativas e leases de todas as instalações;
- relatório integral do preflight;
- manifesto e hashes dos artefatos locais;
- horário UTC de início da janela.

### Verificação da evidência

Antes de qualquer escrita, a execução deve registrar:

1. referência exata do projeto protegido;
2. identificador do backup ou timestamp PITR;
3. estado `completed`/disponível, horário anterior ao push e política de retenção;
4. procedimento de restauração e responsável nomeado;
5. SHA-256 do pacote de evidências read-only;
6. confirmação de que o backup cobre o banco inteiro do Control-plane.

Não será feito teste destrutivo de restauração no Control-plane. Se o provedor não fornecer prova de conclusão e capacidade de restauração, a execução será encerrada como **BLOCK**, sem recovery. A criação do backup e qualquer restauração exigem autorização explícita própria.

## Congelamento global

O congelamento cobre todas as instalações porque a tabela e as RPCs recuperadas pertencem ao Control-plane compartilhado.

1. Suspender os disparadores de novas operações, workers, schedulers e promoções do Control-plane.
2. Bloquear operacionalmente NEW, UPDATE, retry, validações mutáveis e qualquer promoção durante toda a janela.
3. Aguardar o encerramento de qualquer execução já iniciada; não cancelar nem editar uma operação para fazê-la parecer inativa.
4. Fazer duas leituras separadas de operações e leases, antes e depois do backup, exigindo zero operações ativas ou retomáveis em todas as instalações.
5. Executar novamente o preflight oficial imediatamente antes do dry-run.
6. Manter o congelamento até o relatório pós-recovery ser aprovado.

A garantia é fail-closed: suspensão dos iniciadores + duas observações de quiescência + precondição SQL da recovery + advisory lock transacional. Se algum iniciador não puder ser efetivamente suspenso, ou se surgir nova operação/lease entre as verificações, a recovery será abortada. O advisory lock isoladamente não será considerado garantia suficiente.

## Alterações exatas da recovery

A migration executará somente estas mudanças no Control-plane:

1. Adquirir o advisory lock transacional `unitos:master:control-plane-promotion`.
2. Validar as precondições e abortar diante de ledger, dependência, objeto parcial ou operação ativa divergente.
3. Criar `public.installation_migration_reconciliation_evidence` com:
   - chave primária UUID;
   - FKs para `installations` e `installation_operations`, ambas com `ON DELETE CASCADE`;
   - duas unicidades, dois checks, timestamps e campos de evidência;
   - índice por `operation_id, package_position`.
4. Revogar privilégios gerais; conceder `SELECT` a `authenticated` e acesso completo a `service_role`.
5. Habilitar RLS e criar a policy de leitura exclusiva para Super Admin autenticado.
6. Criar `record_installation_migration_reconciliation_evidence(uuid,text,bigint,text,jsonb)` como `SECURITY DEFINER`, `search_path=public`, executável somente por `service_role`.
7. Criar `read_installation_migration_reconciliation_evidence(uuid,text)` com as mesmas proteções e execução somente por `service_role`.
8. Validar tabela, constraints, índice, RLS, policy, ACLs, assinaturas e propriedades antes do commit.
9. A Supabase CLI registrará somente `20260919143000` no ledger após o commit.

A recovery não:

- insere manualmente no ledger;
- marca a 1.4.10 como aplicada;
- reaplica a 1.4.11;
- executa normalização;
- altera dados existentes de instalações, operações ou clientes;
- toca o banco Client da Apex;
- cria UPDATE, NEW, retry ou P0.

## Sequência operacional autorizável

### Etapa A — Backup e congelamento

1. Ativar o congelamento global.
2. Confirmar quiescência de todas as instalações.
3. Criar e verificar o backup.
4. Capturar o pacote de evidências inicial.
5. Se qualquer gate falhar, retirar a janela de execução sem tocar no schema.

### Etapa B — Preflight final e preparação

1. Reexecutar o preflight read-only e exigir 16/16 PASS.
2. Conferir manifesto e hashes antes e depois da cópia.
3. Montar staging somente com o histórico remoto correspondente e a recovery.
4. Rejeitar arquivos extras, versões duplicadas e hashes históricos divergentes.
5. Executar dry-run; aceitar exatamente uma seleção: `20260919143000_recover_missing_legacy_reconciliation.sql`.
6. Rejeitar qualquer menção selecionada à 1.4.10, 1.4.11 ou outra migration.
7. Comparar novamente o ledger e o SHA-256 do staging.

### Etapa C — Escrita única da recovery

1. Executar uma única vez com Supabase CLI 2.117.0.
2. Não executar comandos paralelos durante o push.
3. A migration opera em transação e faz rollback integral se qualquer precondição ou pós-condição falhar.
4. Não realizar retry automático se houver falha.

### Etapa D — Validação pós-recovery

1. Exigir ledger final `1.4.10=0, 1.4.11=1, 1.4.14=1`.
2. Confirmar que 1.4.11 permaneceu inalterada.
3. Verificar tabela, constraints, índice, RLS, policy, grants, RPCs, corpos, owner e ACLs.
4. Executar `verify-installation-master.sql` em modo read-only e exigir aprovação integral.
5. Confirmar que nenhuma instalação, inclusive Apex, recebeu escrita operacional.
6. Produzir relatório final e manter UPDATEs congelados até decisão posterior.

## Critérios de abortamento e resposta a falha

Abortar sem escrita se identidade, backup, congelamento, hashes, ledger, preflight, CLI ou dry-run divergirem. Abortar com rollback se a migration detectar precondição/pós-condição inválida ou erro de SQL.

Se houver falha após commit, manter congelamento, preservar evidências e não aplicar correção manual, `migration repair`, retry, UPDATE ou reaplicação. A restauração do backup ou uma correção forward exigirá nova decisão e autorização explícita.

## Recovery versus UPDATE

| Recovery 1.4.14 | UPDATE da Apex |
|---|---|
| Alvo: Control-plane compartilhado | Alvo: instalação Client Apex |
| Cria infraestrutura de evidência ausente | Aplica pacote Client e muda versão operacional |
| Não cria operação de instalação | Exige nova operação UPDATE |
| Não altera release/commit da Apex | Deve reconciliar release, commit e migrations Client |
| Autorização tratada neste plano | Fora do escopo e exige autorização futura independente |

## Autorização solicitada

Nenhuma ação remota foi executada durante a preparação deste plano.

Para iniciar somente a **Etapa A**, é necessária autorização explícita para:

1. ativar o congelamento global;
2. criar e verificar o backup do Control-plane;
3. executar apenas as leituras de confirmação associadas.

Essa autorização não autoriza a recovery. Após apresentar as evidências do backup e do congelamento, será solicitada uma segunda autorização explícita para as Etapas B e C. UPDATE da Apex continuará proibido.
