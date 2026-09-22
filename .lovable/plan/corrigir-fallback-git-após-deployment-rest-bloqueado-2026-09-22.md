# Corrigir fallback Git após deployment REST bloqueado

## Implementação

- No provisionamento, quando um deployment REST já criado mudar para `BLOCKED` por política “Only Git deployments”, descartar esse deployment como prova válida.
- Reutilizar o commit Git de fallback já salvo no checkpoint; criar somente um novo commit quando nenhum existir.
- Localizar e acompanhar exclusivamente o deployment Git correspondente ao SHA esperado até `READY`.
- Manter a operação retomável: preservar banco, variáveis, código e etapas concluídas, sem herdar leases, fencing ou estados terminais.
- Manter outros erros de deployment como falha; somente a recusa conhecida por política Git acionará essa troca de caminho.

## Testes e validação

- Cobrir REST criado e posteriormente `BLOCKED`, seguido de deployment Git `READY`.
- Cobrir retomada sem duplicar commit ou deployment e sem reaplicar etapas concluídas.
- Confirmar que deployment Git bloqueado ou com SHA divergente continua falhando de forma fechada.
- Aplicar MASTER-first: avançar para 1.4.29, regenerar o pacote, sincronizar versões e verificadores, executar testes focados, suíte global, tipos, build e `bun run master:check`.

## Entrega

- Não alterar diretamente a Apex nem outras instalações durante a correção.
- Não publicar o MASTER sem nova autorização explícita.
- Após a publicação autorizada, “Tentar novamente” na Apex retomará do último ponto comprovado.
