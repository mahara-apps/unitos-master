# Suporte explícito ao destino `excluded`

## Alteração
- Aceitar somente `client`, `control-plane`, `split` e `excluded` no contrato do gerador.
- Contabilizar cada migration física diretamente na lista ordenada do mapa, inclusive as excluídas.
- Manter `excluded` fora da seleção do pacote e do manifesto, sem mudar os fluxos de `client`, `control-plane` e `split`.
- Remover a exceção legada `excludedBeforeManifest`, que confunde exclusão com Control Plane.

## Validação
- Adicionar testes estruturais isolados para aceitação, cobertura física, exclusão do pacote, rejeição de destino desconhecido e preservação dos três destinos existentes.
- Executar somente esses testes; não executar o gerador nem qualquer operação externa.

## Limites
- Não alterar mapa, fragmentos, pacote, manifesto, versão/SHA, executor, verificação de instalação ou bancos nesta etapa.
