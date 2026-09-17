# Corrigir a validação final das filas de retomada

## Causa confirmada
A etapa anterior à validação final executa `hardenHelperTables`, que atualmente remove `_unitos_deferred_sql` quando a fila está vazia. Em seguida, o verificador Client exige que essa mesma tabela exista, contenha `run_key`, tenha RLS e não conceda acesso a `anon`/`authenticated`. Isso explica simultaneamente os dois FAILs observados.

## Implementação
1. Alterar o reparo idempotente da fila para **não apagá-la quando vazia**.
2. Fazer o reparo garantir a estrutura canônica mesmo em instalações legadas ou após a remoção anterior:
   - criar `_unitos_deferred_sql` se estiver ausente;
   - adicionar `run_key`, `sqlstate` e `error_message` quando faltarem;
   - garantir o índice por `run_key` e `id`;
   - habilitar RLS e revogar acessos de `anon` e `authenticated`.
3. Manter inalteradas as duas verificações finais: elas continuarão reprovando qualquer fila ausente, sem `run_key` ou desprotegida.
4. Adicionar testes para fila ausente, fila legada sem `run_key`, fila vazia e execução repetida do reparo.

## Validação e entrega MASTER-first
1. Atualizar a versão de release do Master e regenerar os contratos/pacote determinísticos; o conteúdo Client de migrations deve permanecer com os mesmos 85 blocos e sem SQL Control-plane.
2. Executar testes focados de baseline, retomada, validação e retry; depois `master:check`, suíte local, typecheck, lint focado e confirmar o build.
3. Publicar o Master corrigido somente após todos os gates passarem.
4. Não executar SQL manual/remoto, NEW, novo deploy Vercel, criação de recursos ou retry automático. Após a publicação, informar a ação oficial necessária para retomar a instalação existente.
