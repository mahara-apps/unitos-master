# Compatibilidade histórica dos preflights 1.4.18

## Objetivo
Aceitar apenas histórico comprovadamente terminal (`deferred`, `interrupted`, `retryable` terminal e leases residuais), sem alterar registros e mantendo bloqueio fail-closed para atividade ou ambiguidade.

## Alterações
1. Criar um catálogo SQL versionado e somente leitura com:
   - estados conhecidos de operação e tentativa;
   - `deferred` e `interrupted` como não ativos somente quando ligados a operação terminal;
   - critérios verificáveis para lease residual versus lease ativo;
   - rejeição de estado desconhecido, vínculo órfão, claim, heartbeat ou concorrência.
2. Reutilizar exatamente essa política em:
   - preflight e ativação do freeze;
   - preflight e instalação do executor;
   - preflight e transação da recovery.
3. Preservar a operação Apex `pending` sem lease e todas as tentativas históricas; nenhuma instrução de limpeza ou reclassificação será adicionada.
4. Atualizar manifests/hashes e pacote MASTER-first afetados pelos SQLs.
5. Ampliar os ensaios PostgreSQL para cobrir `deferred`, `interrupted`, estado desconhecido, lease residual terminal, lease ativo, Apex pending, concorrência e fencing.

## Validação local
- Testes focados de freeze, executor, recovery e contrato operacional.
- Ensaios PostgreSQL isolados.
- `bun run master:check`.
- Typecheck com `bunx tsgo --noEmit`.
- Lint somente dos arquivos TypeScript alterados.
- `bun run build` e verificação final de integridade.

## Limites
Nenhuma consulta ou escrita remota; nenhuma mudança na Apex, cron, dados históricos, telas ou gates operacionais.
