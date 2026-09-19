# UPDATE legado robusto no Unitos Master

## Objetivo e limites

Planejar o endurecimento do fluxo UPDATE legado no Master 1.4.11, preservando RBAC, RLS, autenticação, separação Master × Client, pacote Client atual e comportamento NEW moderno.

Nesta etapa não haverá alteração de código, banco, dados, operações, SQL remoto, retry, NEW ou publicação. A implementação futura só avançará após aprovação explícita e seguirá MASTER-first.

## Diagnóstico confirmado

### Caminho atual

- NEW e UPDATE convergem no executor canônico `applyDatabaseDelta`/`applyStatementByStatement`; `bootstrap.sh` delega ao endpoint do Master e não mantém um executor SQL Client paralelo.
- A autorização de UPDATE fixa commit, versão, SHA-256 e total do pacote na operação. Retomadas validam essa identidade antes de aplicar SQL.
- O pacote Client continua com 85 blocos e SHA `cbcc637fa3ba1312dabffb217c618a5fe6b52ec33f54a5cd4251b8620bdb4978`.
- A separação atual é 82 migrations Client, 30 Control-plane, 3 split e 2 excluded.
- O manifesto valida ordem e SHA-256 de cada migration. O ledger/checkpoint operacional ainda usa um fingerprint curto próprio.
- O delta é decidido pelo ledger `_unitos_applied_deltas`, pelo progresso canônico no Master e pela posição/fingerprint no pacote; não é um diff geral do schema.
- O executor retoma por statement, em lotes de 25, usando `_unitos_migration_checkpoints` no Client e `installation_operation_migrations` no Master.
- Lease, heartbeat e fencing protegem checkpoint, retry, yield, defer e finalização. O worker normaliza contratos históricos antes de reivindicar operações stale.
- `000_extensions.sql` converge `vector` para `public` e exige `pg_extension`, `public.vector` e `vector_cosine_ops`; checkpoints concluídos são revalidados.

### Causas históricas já corrigidas até 1.4.11

1. Posições reconciliadas não eram promovidas ao progresso canônico.
2. A promoção em massa aceitava sucesso parcial.
3. A evidência de reconciliação não funcionava como gate operacional.
4. Leases, checkpoints, tentativas órfãs e `manual_review` históricos não tinham normalização uniforme.
5. Blocos procedurais podiam mascarar SQLSTATE real do pgvector.
6. O bootstrap e o UPDATE já foram convergidos para o mesmo executor.

### Lacunas confirmadas no código atual

1. **Ledger misto não dispara reconciliação:** a reconciliação legada só ocorre quando existe blob cumulativo e nenhum label individual foi encontrado. Blob + progresso parcial pode cair diretamente no delta e reaplicar posições cuja execução não foi provada no ledger moderno.
2. **Promoção não é atômica entre bancos:** evidências e progresso canônico ficam no Master, enquanto `_unitos_applied_deltas` fica no Client. Não existe transação distribuída; uma falha intermediária pode deixar promoção confirmada de um lado e pendente do outro.
3. **Resposta da RPC de evidências é validada superficialmente:** hoje basta ser array; falta validar cardinalidade, posição, arquivo, fingerprint, classificação, chave, status e ausência de duplicatas antes da promoção.
4. **Dois contratos de fingerprint:** o manifesto usa SHA-256, mas ledger/checkpoints usam hash curto FNV-like/base36. Isso cria ambiguidade e risco de colisão, embora não haja colisão comprovada.
5. **Marco de corte histórico inoperante:** `INCREMENTAL_LEDGER_CUTOVER_FILE` é exportado e testado apenas por formato, mas não participa da decisão de reconciliação/delta.
6. **Cobertura PostgreSQL real insuficiente:** o ensaio P0 é opt-in e atualmente depende do ambiente `descartável2`; os gates normais não comprovam replay real de 1.3.x/1.4.x, rollback transacional, concorrência de leases ou isolamento físico Master × Client.
7. **Drift documental:** o comentário de `runner.server.ts` ainda descreve bootstrap manual, enquanto o script atual delega ao executor remoto do Master.

## Hipóteses a provar antes de mudar comportamento

- Instalações 1.3.x podem conter combinações distintas de blob cumulativo, labels individuais e checkpoints, não apenas os estados representados nos testes atuais.
- Alguns `running` antigos no Client podem pertencer a pacote/fingerprint diferente; nunca devem ser retomados por posição apenas.
- Reaplicar migrations parcialmente compatíveis pode falhar fora dos casos de duplicidade explicitamente tolerados.
- Mover fingerprints para SHA-256 sem estratégia dual-read pode invalidar progresso moderno legítimo.
- A posição 74 e as posições 72/85 continuam exigindo tratamento especial por estado final ou evidência externa; não devem ser promovidas por versão declarada.

## Desenho robusto proposto

### 1. Congelar uma matriz de compatibilidade verificável

Definir fixtures imutáveis para versões representativas 1.3.x e 1.4.x, contendo schema, ledger, checkpoints, extensões e metadados esperados. Compatibilidade será decidida por evidência de estado, nunca apenas por `current_version`.

### 2. Criar um inventário canônico único do pacote

Para cada posição, manter no contrato autorizado:

- versão e SHA-256 do pacote;
- commit do Master;
- posição, arquivo e SHA-256 da migration;
- fingerprint legado aceito somente para leitura compatível;
- total de statements calculado pelo mesmo parser do executor;
- destino Client/Control-plane/split/excluded.

Novas gravações devem usar SHA-256 canônico. Registros antigos permanecem em dual-read, mas só são promovidos após equivalência comprovada com o SHA-256 do manifesto.

### 3. Classificar todo estado legado, inclusive ledger misto

Sempre que houver blob legado, ausência, lacuna, label desconhecido, checkpoint running ou divergência, construir uma matriz por posição. Cada posição deve resultar em exatamente um estado:

- `completed_canonical`;
- `reconciled_promotable`;
- `pending_safe_to_apply`;
- `partial_compatibility`;
- `external_checkpoint_required`;
- `divergent_blocked`.

Qualquer estado não reconhecido bloqueia antes de executar migrations.

### 4. Validar estruturalmente evidências

A leitura de evidências deve falhar fechada se houver retorno parcial, duplicado, fora de ordem, de outro pacote/operação, fingerprint divergente, classificação inválida ou status não aprovado. A RPC permanece Control-plane, `SECURITY DEFINER`, `search_path` fixo e execução exclusiva por `service_role`.

### 5. Protocolar a promoção cross-store sem falsa atomicidade

Como Master e Client são bancos distintos, usar uma máquina de estados idempotente:

```text
inspected -> evidence_approved -> client_ledger_pending
          -> client_ledger_confirmed -> master_progress_confirmed
          -> ready_to_apply
```

- Cada transição carrega pacote, posição, SHA-256, statements, operation, lease owner e fencing token.
- A escrita no Client usa upsert condicional e verifica o valor persistido.
- A confirmação no Master ocorre somente após releitura do Client.
- Crash em qualquer ponto retoma a mesma transição sem reaplicar SQL.
- Divergência nunca é sobrescrita; vai para `manual_review` com diagnóstico estruturado.
- A RPC em massa continua transacional dentro do Master e rejeita persistência parcial.

### 6. Endurecer checkpoints e stale recovery

- Retomar `running` apenas se package hash, posição, arquivo, SHA-256, total de statements, owner atual e fencing coincidirem.
- Checkpoint legado sem identidade completa deve ser reconciliado ou bloqueado, nunca presumido.
- Lease expirada invalida escritas do worker antigo; novo claim recebe fencing maior.
- Normalização não executa migration, não incrementa tentativas e não transforma divergência em sucesso.
- Uma operação já ativa ou uma promoção pendente impede retry duplicado.

### 7. Tratar `000_extensions` como pré-condição explícita

Cobrir os estados: extensão ausente, em `extensions`, em `public`, tipo/opclass ausentes e objetos divergentes. O bloco só conclui depois da pós-condição real. Erros internos de `DO` nunca entram na tolerância genérica de duplicidade.

### 8. Preservar os fluxos modernos

- NEW e UPDATE continuam no mesmo executor.
- Instalações modernas com ledger SHA-256 completo não entram na reconciliação legada.
- O pacote Client não recebe objetos Control-plane.
- O bootstrap Control-plane continua promovido separadamente e verificado pelo gate Master.

## Matriz mínima de testes

### Compatibilidade e ledger

- Fixtures reais ou restauradas de 1.3.x e de cada formato relevante 1.4.x.
- Banco vazio; blob somente; labels somente; blob + labels; ledger completo; lacunas; duplicatas; posições fora de ordem; arquivo desconhecido.
- Fingerprint legado equivalente, SHA-256 válido, hash divergente e colisão simulada do hash curto.
- Marco de corte anterior, exato e posterior.
- Evidência completa, parcial, duplicada, adulterada, de outro pacote e resposta RPC malformada.

### Promoção e atomicidade operacional

- Promoção integral aprovada.
- Falha antes/depois da escrita Client e antes/depois da confirmação Master.
- Rollback real da RPC em massa quando uma posição diverge.
- Repetição após crash sem duplicar ledger ou executar migration.
- Concorrência entre dois workers; perda de lease; fencing antigo; heartbeat tardio.

### Checkpoints e execução

- `running` compatível, stale compatível, stale divergente e checkpoint de pacote anterior.
- Crash antes do statement, após commit e antes do checkpoint.
- Total de statements divergente e alteração de parser/conteúdo.
- Erros toleráveis somente nos DDLs explicitamente classificados; erro real em `DO` permanece fatal.

### pgvector

- Ausente; instalado em `extensions`; instalado em `public`; tipo ausente; opclass ausente; schema conflitante.
- Reexecução idempotente e pós-condição obrigatória.
- Rollback/erro real sem checkpoint falso positivo.

### Regressões e isolamento

- NEW limpo e NEW retomado.
- UPDATE moderno sem caminho legado.
- UPDATE 1.3.x e 1.4.x com cada estado da matriz.
- Retry/yield/defer/finalize e `attempt_count`.
- Client com 85 blocos e SHA esperado.
- Ausência de tabelas/RPCs Control-plane no Client.
- Bootstrap e executor usando o mesmo pacote autorizado.
- Assinatura, ACL, RLS e `search_path` de todas as RPCs Master.

### Execução PostgreSQL real obrigatória

Usar somente ambiente descartável explicitamente autorizado, após gates administrativos. O harness deve criar seu próprio namespace/fixtures, executar limpeza verificável e provar:

- transações e rollback reais;
- RPCs reais com `service_role` e negação para roles públicas;
- concorrência real com duas sessões;
- pgvector real;
- isolamento Master/Client;
- repetição idempotente.

Banco limpo sozinho não basta: fixtures históricas devem ser materializadas e validadas.

## Sequência segura de implementação

1. Congelar fixtures, inventário e critérios de aceitação antes de alterar o executor.
2. Adicionar testes que reproduzam ledger misto, evidência malformada, crash cross-store e fingerprint divergente; confirmar falha no código 1.4.11.
3. Implementar validação estrutural e classificação completa do estado legado, sem executar migrations.
4. Introduzir SHA-256 canônico com dual-read explícito para fingerprints históricos.
5. Implementar a máquina de estados de promoção cross-store e RPCs Master transacionais/fail-closed.
6. Integrar promoção ao cálculo de delta; somente `ready_to_apply` pode liberar UPDATE.
7. Endurecer retomada de checkpoints, stale, retry e fencing.
8. Atualizar documentação do bootstrap/executor e verificadores Client/Master.
9. Executar testes focados e PostgreSQL real no ambiente autorizado; parar no primeiro gate falho.
10. Seguir MASTER-first: atualizar código, gerar pacote via `build_delta.py`, manter `delta_version.txt` e `MASTER_RELEASE_VERSION` iguais, atualizar `verify-installation.sql`, executar `bun run master:check`, suíte global oficial, typecheck, lint e build.
11. Confirmar novamente 85 blocos/SHA e isolamento Client/Control-plane.
12. Publicar somente com autorização explícita. Não iniciar UPDATE real automaticamente; primeiro apresentar evidências e solicitar autorização separada.

## Critérios de bloqueio

Parar sem promoção nem execução se ocorrer qualquer um destes casos:

- identidade do pacote, commit, total ou SHA divergente;
- evidência incompleta ou ambígua;
- ledger/checkpoint misto não classificável;
- RPC/ACL/RLS diferente do contrato;
- lease/fencing não verificável;
- ambiente PostgreSQL real sem autorização administrativa;
- Master confundido com projeto Client;
- regressão NEW, alteração do pacote Client ou falha em qualquer gate.

## Resultado esperado

Um UPDATE legado passa a ser uma reconciliação verificável e retomável: nenhuma migration é presumida, nenhuma posição divergente é reaplicada silenciosamente, nenhuma promoção parcial é tratada como sucesso e nenhum retry antigo consegue gravar após perder o fencing. O fluxo moderno permanece inalterado e o UPDATE real continua dependente de autorização posterior.
