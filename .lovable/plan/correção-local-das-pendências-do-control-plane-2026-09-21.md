# Correção local das pendências do Control-plane

## Objetivo

Fechar exclusivamente as pendências da auditoria local, mantendo a operação Apex e todos os ambientes remotos intactos. O resultado continuará bloqueando qualquer ato operacional enquanto Master/Client e Control-plane declararem versões diferentes.

## Implementação

1. **Catálogo versionado de estados e política histórica**
   - Criar um contrato local, explícito e versionado para os estados `pending`, `running`, `retryable`, `completed`, `failed`, `exhausted`, `orphaned`, `deferred` e `interrupted`.
   - Classificar separadamente estados de operação e de tentativa, distinguindo ativo, terminal comprovado e ambíguo.
   - Tratar `deferred` e `interrupted` como históricos que exigem evidência da operação pai; bloquear combinações sem prova terminal, vínculos órfãos, fencing divergente e qualquer estado desconhecido.
   - Considerar lease residual como histórico somente quando a operação estiver comprovadamente terminal, o lease estiver expirado e não houver tentativa ativa/fencing incompatível. Nunca limpar ou reescrever dados.
   - Aplicar a mesma política aos preflights de freeze, executor e recovery e às precondições transacionais correspondentes.

2. **Preflight sem falsos PASS**
   - Substituir os PASS constantes de contagem por condições verificáveis e observações explícitas.
   - Validar presença e integridade dos contadores antes de aceitar o relatório.
   - Adicionar regressões para contadores ausentes, inválidos, negativos ou incompatíveis com as linhas classificadas.

3. **Ensaios PostgreSQL locais**
   - Ampliar o ensaio determinístico para cobrir todos os estados históricos, leases expirados/ativos, fencing consistente/divergente e preservação da operação `pending`.
   - Criar ensaio transacional local da promoção do Control-plane: sucesso atômico, geração divergente, evidência incompleta, concorrência e preservação do estado em rollback.
   - Criar ensaio local do cron 37: freeze ativo/inativo, contrato divergente, concorrência, operação `pending` preservada e alteração exclusiva do job 37.
   - Confirmar no teste de shell que `--converge-existing` retorna erro 2 antes de qualquer consulta, auditoria ou escrita.

4. **Compatibilidade explícita de versões e hashes**
   - Criar verificador local read-only que compare `MASTER_RELEASE_VERSION`, `delta_version.txt`, `bootstrap-control-plane.json`, `control-plane-contract.json` e hashes dos artefatos declarados.
   - Retornar `BLOCK` explicativo quando Master/Client e Control-plane divergirem; não escolher versão, não promover e não reescrever contratos.
   - Integrar o verificador ao `master:check` e aos comandos locais que poderiam preparar atos do Control-plane, antes de qualquer conexão ou gate de escrita.
   - Manter o estado factual atual: Master/Client `1.4.19` e Control-plane `1.4.18`; portanto, a validação cruzada deverá terminar em `BLOCK` até decisão explícita posterior.

5. **Selagem MASTER-first local**
   - Regenerar somente artefatos locais derivados dos arquivos alterados.
   - Atualizar hashes do contrato Control-plane sem alterar sua versão por inferência.
   - Não alterar a versão do pacote Client, migrations remotas, manifestos Client ou operação Apex.

## Arquivos previstos

- Ajustar SQLs e preflights em `supabase/master/` relacionados a freeze, executor e recovery.
- Criar o catálogo e o verificador em `supabase/master/` e `supabase/master/tools/`.
- Criar ensaios PostgreSQL locais de promoção/cron e ampliar o ensaio do executor.
- Ajustar `package.json` apenas para incluir os novos ensaios/verificador no `master:check`.
- Ajustar testes focados em `tests/installation-master-*.unit.test.ts`, `tests/installation-global-freeze.unit.test.ts` e `tests/installation-control-plane-operational-unblocks.unit.test.ts`.
- Regenerar `supabase/master/control-plane-contract.json` e, se necessário pelo gerador existente, `bootstrap-control-plane.sql/json`, preservando as versões declaradas.

## Validação e critério de encerramento

- Testes focados Vitest.
- Ensaios PostgreSQL locais de executor, recovery, promoção e cron 37.
- Teste do comando legado com código 2 e zero efeitos.
- `bun run master:check`, aceitando como resultado correto o `BLOCK` explícito da divergência de versões onde aplicável, sem mascará-lo.
- Typecheck, lint somente dos arquivos aplicáveis e build.
- Relatório final por pendência com PASS/BLOCK, arquivos modificados, evidências, bloqueios remanescentes e confirmação de nenhuma ação remota.
