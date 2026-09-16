# Corrigir colisão da variável do pgvector

## Escopo
- Alterar somente o bloco de convergência do pgvector no snapshot canônico, renomeando a variável local `current_schema` para `detected_schema` e ajustando suas referências.
- Não modificar executor, checkpoints, ordem, APIs, retries, Vercel, GitHub ou registro de instalação.
- Não executar NEW nem acessar qualquer banco externo.

## Testes
- Ajustar a cobertura focada para impedir regressão do identificador e validar os estados: extensão ausente, em `extensions` e já em `public`.
- Comprovar pós-condições (`public.vector` e `public.vector_cosine_ops`), reexecução idempotente e rollback sem resíduo.
- Executar testes focados de instalação, suíte global, typecheck, lint, build e `master:check`.

## MASTER-first
- Regenerar o pacote distribuível após a correção.
- Sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION` com a nova versão/hash gerados.
- Confirmar que a verificação de instalação continua cobrindo o pgvector e concluir com `master:check` aprovado.
- Não publicar nem promover a versão.
