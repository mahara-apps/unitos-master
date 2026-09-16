# Correção determinística do pgvector no NEW

## Escopo
- Alterar somente o executor SQL, o contrato/pós-condição de `000_extensions`, os testes correspondentes e o acompanhamento MASTER-first.
- Não alterar Vercel, não executar NEW, não acessar Taveira e não executar SQL em bancos externos.

## Implementação
1. Impedir que o guard externo classifique SQLSTATE de duplicidade originado dentro de um bloco `DO`/PLpgSQL como sucesso; blocos procedurais serão executados sem o catcher genérico, propagando qualquer erro interno.
2. Manter a convergência não destrutiva do pgvector: criar quando ausente, mover de `extensions` para `public` quando necessário e reutilizar quando já estiver em `public`.
3. Fortalecer a pós-condição transacional para exigir simultaneamente `pg_extension.vector`, `public.vector` e `public.vector_cosine_ops` antes de gravar checkpoint `completed` ou progresso definitivo.
4. Garantir que falha de convergência retorne erro ao workflow e deixe a etapa de banco como falha.

## Testes
- Cobrir os estados A: ausente, B: `extensions`, C: `public`, D: erro interno `42710` em `DO` e E: pós-condição falsa.
- Comprovar que nenhum cenário conclui `000_extensions` sem os três objetos funcionais.
- Executar testes focados de bootstrap/extensions, testes de instalação, suíte global, typecheck, lint, build e `master:check`.

## MASTER-first
- Regenerar o pacote pelo gerador oficial e manter versão/hash/manifesto sincronizados conforme os guardiões do Master.
- Não publicar nem executar a instalação neste turno.
