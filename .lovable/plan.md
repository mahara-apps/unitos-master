# Correção da NEW limpa — `public.vector`

## Objetivo

Fazer o bootstrap convergir o pgvector para o schema `public` sem apagar a extensão e impedir que `000_extensions` seja concluído sem comprovar o tipo e a classe de operadores exigidos por `001_initial_schema`.

## Implementação

1. Tornar `000_extensions.sql` idempotente nos três estados: extensão ausente, existente em `extensions` ou já em `public`.
2. Quando necessário, usar a relocação suportada pela própria extensão para preservar seus objetos e dependências; falhar claramente se a convergência não for possível.
3. Adicionar uma pós-condição explícita no executor antes de salvar `000_extensions = DONE`, verificando `to_regtype('public.vector')` e a presença de `public.vector_cosine_ops` em `pg_opclass`.
4. Revalidar a pós-condição também ao retomar um checkpoint antigo marcado como concluído, sem reexecutar ou reiniciar a NEW atual.
5. Tornar o relatório final de instalação sensível ao schema correto do pgvector.

## Testes e validação

- Cobrir extensão ausente, em `extensions` e em `public`, além de pós-condição ausente sem checkpoint final.
- Cobrir a ordem e o conteúdo do bootstrap, incluindo a dependência `000 → 001`.
- Executar os testes específicos, todos os testes de instalação, a suíte global, tipos, lint dos arquivos alterados, build e `master:check`.
- Executar o ensaio `000 → 001` somente em banco descartável explicitamente fornecido para testes; nunca usar a NEW preservada, Taveira ou outra instalação legada.

## Limites

- Nenhuma NEW real será iniciada ou retomada.
- Nenhum SQL será aplicado na NEW atual, Taveira ou produção.
- Nenhuma refatoração fora do bootstrap de extensões, sua pós-condição e cobertura associada.