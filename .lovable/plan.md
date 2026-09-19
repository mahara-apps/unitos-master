# Recuperação segura do Control-plane publicado

## Objetivo e decisão recomendada

Recuperar os objetos ausentes da antiga 1.4.10 sem falsificar seu histórico e sem executar novamente a 1.4.11.

**Recomendação:** criar uma **nova migration de recuperação Control-plane**, imutável e auditável, contendo somente o estado estrutural esperado da 1.4.10. Ela terá versão e SHA-256 próprios. A entrada ausente da 1.4.10 continuará ausente no ledger histórico; a nova entrada documentará honestamente quando e como o estado foi reparado.

Não usar `migration repair`, não inserir manualmente uma linha para 1.4.10 e não executar a convergência atual, pois ela inclui novamente a 1.4.11.

## Fase 0 — Congelamento e autorização

- Bloquear temporariamente promoções do Control-plane e novos UPDATEs de instalações.
- Confirmar que não há operação ativa, lease válida ou worker processando a Apex.
- Identificar uma única janela, operador e artefato aprovado para a recuperação.
- Separar duas autorizações: primeiro alterações locais do mecanismo; depois aplicação remota. A autorização de uma não autoriza a outra.

## Fase 1 — Preflight read-only do estado real

Gerar e guardar um relatório assinado com:

1. **Identidade do alvo:** projeto/ref do Control-plane, banco e ambiente esperados; abortar se o alvo divergir do Master.
2. **Histórico:** confirmar 1.4.10 ausente e 1.4.11 presente em `supabase_migrations.schema_migrations`; capturar versão, nome e hash normalizado do statement registrado da 1.4.11.
3. **Objetos da 1.4.10:** confirmar ausência da tabela, duas RPCs, duas FKs, duas unicidades, checks, índice, RLS, policy e grants esperados.
4. **Estado parcial:** pesquisar objetos homônimos, overloads das RPCs, policy/index com mesmo nome, dependências órfãs e tipos incompatíveis. Qualquer presença parcial ou definição divergente bloqueia o plano padrão.
5. **Dependências anteriores:** confirmar `installations`, `installation_operations`, `is_super_admin(uuid)`, `gen_random_uuid()` e os papéis `service_role`, `authenticated` e `anon` com contratos compatíveis.
6. **1.4.11:** comparar assinatura, retorno, `SECURITY DEFINER`, `search_path`, ACL e corpo normalizado das duas RPCs da 1.4.11 com o artefato versionado. Não basta verificar existência.
7. **Apex:** capturar somente por leitura versão fixada/publicada, operações e tentativas, ausência de progresso de migrations e motivo de bloqueio; confirmar que o diagnóstico não cria operação.
8. **Impressões digitais:** calcular os SHA-256 dos arquivos imutáveis 1.4.10, 1.4.11, nova recuperação, manifesto e bootstrap; comparar 1.4.10/1.4.11 com os metadados já versionados.

**Gate:** prosseguir apenas no estado exato “1.4.10 ausente por inteiro + 1.4.11 íntegra + dependências anteriores compatíveis + nenhuma operação ativa”.

## Fase 2 — Preparar a recuperação localmente, sem tocar o banco

### Migration de recuperação

Criar uma nova migration classificada somente como `control-plane` que:

- declare no cabeçalho a versão e o SHA-256 da 1.4.10 que está reparando;
- adquira advisory lock exclusivo da promoção;
- faça precondições fail-closed: 1.4.11 presente e íntegra, 1.4.10 ausente no ledger histórico e objetos-alvo integralmente ausentes;
- crie somente a tabela de evidências, constraints, índice, RLS, policy, grants e as RPCs `record_...` e `read_...`;
- preserve exatamente assinaturas e comportamento esperados pelo runtime publicado;
- valide dentro da mesma transação todos os objetos e ACLs antes do commit;
- não contenha SQL da 1.4.11, não execute normalização e não altere dados de instalações/operações.

A migration antiga 1.4.10 e a 1.4.11 permanecem imutáveis. A recuperação recebe identidade própria; nenhuma linha histórica é fabricada.

### Executor de recuperação

Adicionar ao promotor Master um modo explícito de recuperação, diferente de bootstrap e convergência, que:

- aceite somente o estado preflight selado e o projeto Master allowlisted;
- verifique versão, ordem e SHA-256 do artefato antes de conectar;
- aplique **apenas** a nova migration pelo mecanismo oficial que executa o SQL e registra essa nova versão no ledger;
- use uma transação, `ON_ERROR_STOP`, timeout operacional normal e advisory lock;
- execute verificação estrutural ainda antes de considerar a promoção concluída;
- nunca chame `migration repair` e nunca registre 1.4.10 como aplicada.

### MASTER-first

Antes de qualquer aplicação remota:

1. Atualizar código, migration e verificadores no Master.
2. Classificar a nova migration como `control-plane`, excluída do pacote Client.
3. Regenerar os artefatos oficiais e o delta Client.
4. Atualizar `delta_version.txt` e `MASTER_RELEASE_VERSION` com a mesma nova versão.
5. Manter o pacote Client semanticamente inalterado; seu SHA deve permanecer igual, salvo mudança Client explicitamente justificada.
6. Cobrir os novos contratos em `verify-installation-master.sql`; não adicionar a tabela ao verificador Client.
7. Rodar `bun run master:check`, tipos, lint, build e testes focados/globais permitidos. Não executar P0.

## Fase 3 — Aplicação remota autorizada

Após autorização específica:

1. Repetir o preflight imediatamente antes da escrita e comparar seu hash com o relatório aprovado.
2. Se houver qualquer drift, abortar sem iniciar transação de escrita.
3. Executar somente a migration de recuperação em transação única.
4. Registrar no ledger a **nova migration de recuperação**, com seu conteúdo real; deixar 1.4.10 ausente e 1.4.11 intocada.
5. Validar dentro da transação: catálogo, constraints, índice, RLS, policy, assinaturas, retorno, `SECURITY DEFINER`, `search_path=public` e ACLs.
6. Commitar somente se todas as verificações críticas passarem.
7. Após o commit, recarregar o cache de schema pelo mecanismo oficial e executar novamente o relatório read-only.

## Fase 4 — Validação pós-recuperação

Exigir todos os resultados abaixo:

- tabela e todos os objetos auxiliares presentes uma única vez;
- RPCs resolvidas exatamente como `record_(uuid,text,bigint,text,jsonb)` e `read_(uuid,text)`;
- `service_role` com execução; `PUBLIC`, `anon` e `authenticated` sem execução;
- tabela sem privilégios para `PUBLIC`/`anon`, somente leitura autenticada protegida por policy Super Admin e acesso completo do serviço;
- RLS habilitado, FKs/uniques/checks/índice idênticos ao contrato;
- chamada read-only da RPC de leitura disponível via interface usada pelo executor e retornando contrato JSON válido;
- 1.4.11 ainda com o mesmo hash/definição e uma única entrada no ledger;
- nova recuperação presente uma única vez no ledger com hash correspondente ao artefato executado;
- 1.4.10 não falsamente marcada como aplicada;
- verificador Master integralmente `PASS`; Client e Apex sem qualquer escrita.

## Fase 5 — Gate antes de novo UPDATE da Apex

Ainda sem iniciar UPDATE:

1. Confirmar que o aplicativo publicado executa uma versão compatível com a reconciliação 1.4.10+.
2. Rodar apenas a inspeção oficial SELECT-only das migrations ambíguas da Apex.
3. Confirmar que a RPC de leitura funciona no mesmo caminho/autorização usado pelo executor.
4. Classificar cada evidência como compatível, divergente ou insuficiente e revisar separadamente posições com checkpoint externo.
5. Confirmar que nenhuma operação histórica será retomada implicitamente e que não há lease ativa.
6. Produzir relatório “apta/não apta para UPDATE”. Um UPDATE real exigirá nova autorização específica.

## Impedir novas lacunas

- Descontinuar aplicação individual irrestrita de migrations `control-plane`.
- Fazer todo executor consultar o mapa de destinos e rejeitar arquivo Control-plane isolado fora de um plano selado.
- Exigir prefixo contínuo do histórico: uma migration posterior não pode ser aplicada se qualquer predecessora necessária estiver ausente.
- Introduzir dependências explícitas no manifesto (`requires`) e precondições SQL nos arquivos dependentes.
- Selar cada release com versão, sequência ordenada, SHA-256 por migration e hash do conjunto; persistir um atestado somente após verificação real do catálogo.
- Tornar publicação do aplicativo dependente da correspondência entre atestado do banco e release do código.
- Verificar estado final e histórico; ledger sozinho nunca será prova suficiente.
- Cobrir em PostgreSQL real: lacuna anterior, ordem invertida, aplicação individual, hash divergente, objeto parcial, falha intermediária, rollback integral e reexecução idempotente.

## Alternativas

### A. Nova migration de recuperação — recomendada

**Vantagens:** histórico verdadeiro, hash próprio, auditável, não reaplica 1.4.11 e permite guards específicos para o estado real.  
**Riscos:** exige uma versão adicional e tratamento explícito da lacuna em futuras auditorias/bootstrap. Mitigar documentando `repairs: 20260917184500` no manifesto e validando equivalência estrutural.

### B. Executar o SQL original da 1.4.10 tardiamente e registrar 1.4.10

**Vantagem:** fecha a sequência nominal.  
**Riscos:** reescreve a cronologia, mistura “ordem do ledger” com “ordem real” e pode depender de comportamento não garantido da ferramenta diante de uma versão posterior já aplicada. Não recomendada.

### C. Rodar a convergência completa

**Vantagem:** usa o caminho canônico atual.  
**Riscos:** reaplica 1.4.11, contraria o requisito e amplia desnecessariamente a superfície de mudança. Rejeitada.

### D. Marcar 1.4.10 com `migration repair`

Não executa os objetos ausentes e perpetua a inconsistência. Rejeitada.

## Critérios objetivos de rollback e bloqueio

### Abort/rollback antes do commit

Abortar e deixar a transação reverter integralmente se ocorrer qualquer um destes eventos:

- alvo/ref não corresponde ao Master;
- drift entre preflight aprovado e preflight imediato;
- 1.4.11 ausente, duplicada ou com definição/hash divergente;
- qualquer objeto da 1.4.10 parcialmente presente ou incompatível;
- dependência anterior ausente/incompatível;
- operação/lease ativa da Apex ou de outra instalação no caminho afetado;
- falha de lock, timeout, statement, constraint, ACL, RLS, assinatura ou verificação;
- ledger não registra exatamente a nova migration executada;
- tentativa de tocar dados de negócio, executar normalização, 1.4.11, UPDATE, NEW ou P0.

### Após o commit

- Se o relatório pós-commit divergir, bloquear imediatamente promoções e UPDATEs; não “consertar” manualmente.
- Preferir correção forward por outra migration auditada. Só considerar reversão destrutiva se a tabela estiver vazia, nenhuma operação tiver consumido as RPCs e existir autorização específica para uma migration inversa.
- Não remover objetos se houver qualquer evidência gravada ou operação iniciada após a recuperação.

## Sequência de autorizações sugerida

1. Autorizar somente a implementação local do mecanismo e dos testes.
2. Revisar hashes, relatório de preflight e ensaio em PostgreSQL descartável sem P0.
3. Autorizar separadamente a aplicação remota da migration de recuperação.
4. Revisar o relatório pós-recuperação.
5. Autorizar separadamente o diagnóstico SELECT-only de aptidão da Apex.
6. Somente depois, decidir sobre um novo UPDATE real da Apex.
