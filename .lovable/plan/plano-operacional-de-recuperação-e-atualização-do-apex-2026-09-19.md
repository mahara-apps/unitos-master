# Plano operacional de recuperação e atualização do Apex

## Objetivo e separação obrigatória

Restabelecer primeiro a consistência do **Control-plane compartilhado** com a recovery 1.4.14 e, somente depois, avaliar um **novo UPDATE da instalação Apex**. São duas mudanças remotas distintas, com autorizações separadas. A recovery não atualiza a Apex; o UPDATE não pode começar antes da recuperação validada.

Identidades conhecidas a reconfirmar por leitura:
- Control-plane: `tkjbhttylouamqxnbfgv`.
- Apex: instalação `0b6b7f5c-44e5-4e85-a33c-37014ed044a2`.
- Projeto Client da Apex: `mvxvjsgfsmeyprefnbzc`.
- Release publicada da Apex: `1.3.72`.
- Commit publicado: `b005d07cb6ab434c2187a95a74d729e9f0db73c2`.

## Gate 0 — Ensaio PostgreSQL isolado

Antes de qualquer escrita no Control-plane real, executar a recovery em um clone descartável, sem integrações com clientes e reproduzindo o estado exato:

- 1.4.11 registrada uma única vez; 1.4.10 e 1.4.14 ausentes do ledger;
- objetos da 1.4.10 integralmente ausentes;
- contratos da 1.4.11 íntegros: assinaturas sem overloads, corpos, retorno, linguagem, propriedades, owner, ACL e dependências;
- nenhuma operação ativa ou retomável.

O ensaio deve comprovar: seleção exclusiva da 1.4.14 pela CLI fixada em 2.117.0; rollback integral em falha; registro automático da recovery; ledger final `1.4.10=0, 1.4.11=1, 1.4.14=1`; objetos e ACLs corretos; segunda execução bloqueada; verificador Master aprovado.

**Dependência:** sem esse ensaio aprovado, a aplicação remota da recovery permanece bloqueada.

## Fase 1 — Preflight atual do Apex e do Control-plane (somente leitura)

Executar imediatamente antes da janela e guardar relatório, horários e hashes:

1. Confirmar as identidades do Control-plane, da instalação Apex e do projeto Client.
2. Confirmar na Apex release/commit publicados, versão reportada, histórico de migrations Client e saúde do schema.
3. Listar todas as operações e tentativas da Apex, incluindo estado, lease, checkpoints, erro terminal, timestamps e relação entre tentativas; não criar nem retomar operação.
4. Confirmar ausência de operação `pending`, `running` ou `retryable` e ausência de worker/lease ativa.
5. Confirmar que as tentativas 1.4.6, 1.4.8 e 1.4.9 não executaram migrations Client nem produziram progresso parcial.
6. No Control-plane, confirmar o ledger exato: 1.4.10 ausente, 1.4.11 presente uma vez e recovery 1.4.14 ausente.
7. Executar o preflight oficial selado e exigir todos os 16 checks `PASS`.
8. Confirmar ausência integral dos objetos da 1.4.10 e integridade completa dos contratos da 1.4.11.
9. Confirmar nenhuma promoção ou operação concorrente em todas as instalações.
10. Comparar manifesto, fontes, staging e hashes individuais; confirmar CLI 2.117.0 e dry-run no formato fixado.

**Estado anteriormente observado, não substitui o novo preflight:** 1.4.11 presente, 1.4.10/recovery e objetos reparados ausentes, dependências íntegras e nenhuma operação ativa. Qualquer diferença nova aborta.

## Fase 2 — Backup e congelamento operacional

Antes de escrita, com autorização específica:

- suspender promoções do Control-plane, workers e novos UPDATEs;
- obter backup/snapshot verificável do Control-plane e registrar identificador, horário e retenção;
- preservar export read-only do ledger, catálogo dos objetos afetados, operações/tentativas da Apex e relatório do preflight;
- confirmar procedimento e responsável pela restauração;
- designar uma janela, um operador e um único artefato aprovado.

O backup é rede de recuperação operacional; não autoriza ignorar falha de precondição nem continuar após drift.

## Fase 3 — Recovery 1.4.14 no Control-plane

Exige autorização explícita exclusiva para a recovery:

1. Repetir o preflight oficial e comparar o resultado ao relatório aprovado.
2. Criar staging temporário, validar hashes de manifesto, fontes e migrations históricas e rejeitar duplicidades/extras.
3. Executar `db push --dry-run`; aceitar somente `20260919143000_recover_missing_legacy_reconciliation.sql`.
4. Revalidar ledger após o dry-run e imediatamente antes da execução.
5. Revalidar o selo SHA-256 do staging imediatamente antes do push.
6. Executar uma única vez pela Supabase CLI 2.117.0; ela registra a 1.4.14. O SQL não escreve no ledger, não marca 1.4.10 e não reaplica 1.4.11.
7. Rodar validação estrutural e o verificador Master read-only após o commit.
8. Manter UPDATEs bloqueados até aprovação formal do relatório pós-recovery.

## Fase 4 — Validação pós-recovery (sem UPDATE da Apex)

Exigir simultaneamente:

- ledger: 1.4.10 ausente, 1.4.11 única e inalterada, 1.4.14 única e registrada pelo executor;
- tabela, constraints, índice, RLS, policy, grants e duas RPCs presentes uma única vez;
- RPCs com assinaturas, corpos, retorno, owner, `SECURITY DEFINER`, `search_path=public` e ACL canônicos;
- `service_role` com execução; `PUBLIC`, `anon` e `authenticated` sem execução indevida;
- leitura da evidência disponível pelo mesmo caminho usado pelo executor;
- `verify-installation-master.sql` integralmente aprovado;
- nenhuma alteração nos dados, release ou histórico de migrations da Apex.

Falha pós-commit congela UPDATEs e aciona avaliação de restauração; não autoriza correção manual, `migration repair` ou reaplicação.

## Fase 5 — Gate específico para um novo UPDATE da Apex

Somente leitura após a recovery aprovada:

1. Validar a compatibilidade entre código Control-plane publicado, release alvo e pacote Client imutável de 85 migrations/SHA `cbcc637fa3ba1312dabffb217c618a5fe6b52ec33f54a5cd4251b8620bdb4978`.
2. Consultar evidências individuais e reconciliar o histórico real da Apex, sem transformar marcador cumulativo por suposição.
3. Confirmar que nenhuma tentativa antiga será retomada e que uma nova operação terá identidade própria.
4. Confirmar sequência pendente, checkpoints externos e ausência de migrations Client parcialmente aplicadas.
5. Produzir decisão formal `APTA` ou `NÃO APTA`, com release alvo, migrations selecionadas e critérios de rollback.

Um UPDATE real exige uma **segunda autorização explícita**, independente da autorização da recovery. Não usar retry de operações antigas e não executar NEW ou P0.

## Fase 6 — UPDATE controlado da Apex

Após autorização exclusiva para o UPDATE:

- criar uma nova operação de UPDATE; nunca retomar tentativas 1.4.6/1.4.8/1.4.9;
- executar somente o pacote Client oficial da release autorizada, preservando separação Master × Client;
- monitorar leases, checkpoints e evidências por migration;
- interromper no primeiro erro estrutural ou divergência de evidência, sem classificar automaticamente como transitório;
- confirmar release/commit finais, ledger Client, integridade do schema, RBAC/RLS/auth e ausência de impacto em outras instalações.

## Critérios de abortamento

Abortar antes de qualquer escrita se houver:

- identidade de projeto/instalação divergente;
- ensaio isolado ausente ou reprovado;
- backup não verificável ou restauração sem responsável;
- qualquer check do preflight diferente de `PASS` ou saída incompleta;
- 1.4.10 ou 1.4.14 já registrada, 1.4.11 ausente/duplicada/divergente;
- objeto parcial, overload, ACL, owner, corpo ou dependência divergente;
- operação, lease, worker, promoção ou ledger concorrente;
- hash divergente, staging alterado/duplicado, CLI ou formato de dry-run diferente;
- dry-run selecionando 1.4.10, 1.4.11 ou qualquer migration além da recovery;
- alteração entre snapshots do ledger.

Durante o UPDATE, abortar se a seleção Client divergir do relatório aprovado, houver progresso histórico incompatível, falha de RBAC/RLS/auth, checkpoint externo ambíguo ou erro estrutural. Não realizar retry automático.

## Matriz de autorização

### Pode ser executado em modo somente leitura

- preflight atual do Apex e do Control-plane;
- leitura de migrations, operações, tentativas, leases, catálogo, ACLs e versões;
- validação de hashes e artefatos locais;
- dry-run somente após confirmar que a CLI não escreve e dentro da janela controlada;
- verificadores pós-recuperação e gate `APTA/NÃO APTA` para UPDATE.

### Exige autorização explícita

- criação de backup/snapshot remoto e congelamento operacional;
- aplicação da recovery 1.4.14 no Control-plane;
- qualquer restauração do backup;
- criação e execução de um novo UPDATE da Apex;
- publicação/deploy de código, se necessário para compatibilidade.

Cada item é uma autorização separada; recovery autorizada não autoriza UPDATE.

### Depende do ensaio PostgreSQL isolado

- autorização para aplicar a recovery no Control-plane real;
- confiança em transação/rollback, ACLs, registro real da CLI e bloqueio de reexecução;
- liberação do gate que permite iniciar a preparação remota da recovery.

## Riscos residuais a aceitar formalmente

- há pequenas janelas entre o último snapshot do ledger e a transação da CLI, e entre o último hash do staging e a leitura dos arquivos pela CLI;
- advisory lock é consultivo e conexões de preflight/CLI são distintas;
- testes locais usam mocks; somente o ensaio PostgreSQL isolado comprova comportamento real de catálogo, ACL, transação, rollback e ledger;
- a recovery altera o Control-plane compartilhado, não apenas a Apex; por isso o congelamento global é obrigatório.
