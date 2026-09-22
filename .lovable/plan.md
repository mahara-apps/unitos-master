# Corrigir o primeiro deployment das instalações novas

## Implementação

- Impedir que o provisionamento tente criar um deployment REST sem o ID confirmado do projeto Vercel e sem o `repoId` confirmado do repositório GitHub.
- Nesses dois casos, usar o caminho Git já existente e idempotente: criar/reutilizar um único commit de republicação, aguardar o deployment automático correspondente e comprovar `READY` com o SHA esperado.
- Manter bloqueio fechado: não criar projeto Vercel implícito, não aceitar deployment sem origem comprovada e não marcar sucesso antes do deployment correto.
- Traduzir os erros `missing_project_settings` e `gitSource.repoId` como indisponibilidade segura da publicação REST, permitindo o fallback Git em vez de encerrar a operação.

## Testes e validação

- Cobrir projeto sem ID, vínculo sem `repoId`, os dois erros HTTP 400 observados e retomada sem commit/deployment duplicado.
- Aplicar MASTER-first, avançar a versão, regenerar os artefatos canônicos e executar testes focados, `master:check`, tipos e verificação da compilação.
- Não alterar RBAC, RLS, autenticação, dados da instalação ou o histórico da operação falha; nova execução somente após publicação autorizada.
