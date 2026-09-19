# Correção local da listagem de instalações 1.4.15

## Objetivo
Restaurar a listagem somente leitura quando os objetos do freeze ainda não existem, sem permitir que qualquer escrita deixe de falhar fechada.

## Implementação
- Classificar a leitura do freeze em estados explícitos: ativo, inativo, objetos ausentes e falha real.
- Usar compatibilidade apenas na listagem: objetos ausentes permitem consultar instalações, mas não executam a reconciliação que pode escrever.
- Manter `assertInstallationOperationsWritable` estritamente fail-closed para freeze ativo, ausente, inválido, erro de autorização ou qualquer outra falha.
- Propagar erros reais de leitura/autorização na listagem, em vez de convertê-los em zero registros.
- Exibir um estado de erro explícito na tela quando a própria listagem falhar.

## Testes e validação
- Cobrir freeze ativo, inativo, objetos ausentes, payload inválido, autorização e erro genérico.
- Confirmar que a ausência permite somente a listagem e que todas as mutações continuam bloqueadas.
- Executar testes focados, `master:check`, verificação de tipos, lint e build.
- Não acessar serviços remotos, aplicar migrations, publicar ou executar recovery/UPDATE/retry.
