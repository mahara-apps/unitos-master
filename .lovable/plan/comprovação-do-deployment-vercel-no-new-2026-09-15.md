# Comprovação do deployment Vercel no NEW

## Implementação

- Extrair do fluxo UPDATE um monitor reutilizável de deployment, preservando o comportamento atual do UPDATE.
- No NEW, persistir o ID, o commit esperado e cada estado observado; concluir somente em `READY` com commit correspondente.
- Aplicar polling curto e finito por invocação. Estados em andamento retornam controle ao executor durável sem concluir a etapa; estados terminais falham.
- Executar o probe HTTP somente após a confirmação do deployment específico.
- Tornar o fallback Git idempotente: persistir o SHA do commit vazio, localizar e reutilizar seu deployment e nunca gerar novo commit enquanto houver publicação em andamento.

## Testes e validação

- Cobrir BUILDING, READY correto, READY divergente, ERROR, timeout, retomada pelo ID, HTTP 200 prematuro e fallback sem duplicação.
- Rodar testes específicos, testes de instalação, suíte global completa, typecheck, lint dos arquivos alterados, build e `master:check`.
- Não executar instalação real, não publicar e não acessar Taveira ou instalações legadas.

## Detalhes técnicos

- O checkpoint continuará em `installation_operations.detail.stageProgress`, sem migration.
- O polling terá intervalo de 3 segundos e janela curta configurável para testes; ao esgotar, a operação permanece retomável.
- A confirmação do commit usará os metadados do deployment consultado pelo ID e falhará fechada se a Vercel não comprovar o SHA.