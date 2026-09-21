# Finalização operacional do Master 1.4.19

## Objetivo

Consolidar o fluxo existente de NEW, UPDATE e retomada em uma arquitetura única 1.4.19, removendo somente artefatos preparatórios ou diagnósticos sem participação na execução e mantendo as proteções de dados, concorrência e autorização.

## Alterações

1. **Eliminar camadas preparatórias sem função operacional**
   - Remover a tela estática de reparação do Control-plane, seu contrato, função read-only e teste.
   - Remover os dois diagnósticos offline duplicados e o teste exclusivo deles.
   - Remover o catálogo JSON sem consumidor de runtime; manter sua política efetiva nos preflights e SQLs executáveis.
   - Retirar links, scripts e referências documentais correspondentes.

2. **Unificar os atos operacionais 1.4.19**
   - Tornar `--apply-convergence-only` realmente isolado, aplicando somente a convergência base.
   - Preservar como atos independentes: freeze, executor, recovery histórica necessária, instalação/promoção do release e cron 37.
   - Fazer promoção e cron compararem o hash informado com o SHA-256 calculado do contrato local antes de qualquer acesso remoto.
   - Harmonizar o cron com a política já aplicada pelo freeze/executor: aceitar somente leases residuais terminais, expirados e com fencing consistente; bloquear todo estado ativo ou ambíguo.

3. **Reduzir e alinhar a suíte Master**
   - Manter cobertura comportamental de NEW completo, UPDATE completo, retomada, concorrência/fencing, promoção, preservação e validação final.
   - Manter os ensaios PostgreSQL reais de executor, recovery, promoção e cron.
   - Remover as expectativas históricas contraditórias e consolidar as verificações essenciais nos testes operacionais restantes.

4. **Selar e validar**
   - Regenerar os artefatos derivados do Control-plane e o pacote Client pelo fluxo MASTER-first, mantendo a release oficial `1.4.19` porque não há mudança de contrato Client.
   - Atualizar hashes gerados e verificar `delta_version.txt` e `MASTER_RELEASE_VERSION` iguais.
   - Executar testes focados, ensaios PostgreSQL, `bun run master:check`, typecheck, lint aplicável e build.
   - Não acessar nem modificar Supabase, GitHub, Vercel ou a operação Apex.

## Resultado esperado

Um conjunto operacional menor, com comandos independentes e verificáveis, sem tela/relatórios preparatórios obsoletos e com uma única sequência documentada para colocar o Master 1.4.19 em funcionamento.
