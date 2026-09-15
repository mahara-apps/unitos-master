# Suíte global confiável — Master v1.4.0

## Objetivo
Eliminar a serialização e o setup remoto indevido dos testes locais, mantendo toda a cobertura e isolando integrações que usam estado externo.

## Implementação
- Separar a execução em dois projetos Vitest no mesmo gate: testes locais paralelos, com timeout curto; integrações/runtime serializadas, com cleanup próprio e timeout explícito.
- Remover o teardown remoto do setup de cada arquivo local; carregá-lo somente no projeto de integração.
- Tornar criação e remoção de identidades de teste concorrentes com limite seguro, erros de cleanup visíveis e chamadas remotas com prazo máximo.
- Preservar todos os arquivos, testes e assertions; corrigir somente expectativas obsoletas diretamente causadas pelo contrato v1.4.0.
- Impedir que integrações destrutivas rodem contra ambiente não declarado como teste, falhando cedo em vez de aguardar ou contaminar estado compartilhado.

## Validação
- Medir grupos afetados e comparar com a linha-base: global 500s; testes locais 140s.
- Rodar a suíte global completa no ambiente seguro disponível; depois typecheck, lint, build, testes focados e `master:check`.
- Não executar NEW, publicar, migrar banco, acessar Taveira ou corrigir achados funcionais independentes.
