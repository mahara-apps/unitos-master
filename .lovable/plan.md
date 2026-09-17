# Publicar o Master 1.4.5

## Escopo confirmado
O contrato local está sincronizado em **1.4.5** no código, no pacote Client e no bootstrap Master. O pacote Client permanece com **85 blocos** e SHA-256 `cbcc637fa3ba1312dabffb217c618a5fe6b52ec33f54a5cd4251b8620bdb4978`.

## Execução
1. Conferir novamente o commit atual, a versão 1.4.5, o manifesto, o SHA e o selo do bootstrap.
2. Verificar o resultado de segurança exigido para publicação e repetir os gates finais locais: pacote determinístico, bootstrap, `master:check`, suíte local, tipos, lint focado e build.
3. Interromper no primeiro erro ou divergência, sem publicar parcialmente.
4. Publicar exclusivamente o Master atual em `unitos-master.lovable.app`.
5. Confirmar, pelos sinais públicos disponíveis, o commit, a versão 1.4.5 e a implantação efetivamente servida. Se a confirmação autenticada ou da plataforma não estiver disponível, reportar a limitação sem presumir sucesso.
6. Informar somente a ação oficial necessária para retomar a instalação existente.

## Restrições
- Não executar SQL remoto.
- Não iniciar retry, NEW ou criação de recursos.
- Não publicar clientes nem disparar novo deploy direto na Vercel.
- Não tocar na Taveira ou na `unitos-new-teste-02` durante a publicação.
