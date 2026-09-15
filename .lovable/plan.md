# Etapa 14 — Unificação canônica de NEW e UPDATE

## Objetivo
Eliminar as cinco divergências da auditoria sem acessar bancos, reconciliar a Taveira, publicar ou alterar a versão 1.3.96 anunciada em produção.

## Implementação
1. Tornar a preparação aditiva do ledger parte explícita do pacote executável compartilhado: criar/adequar `public._unitos_applied_deltas`, adicionar `kind`, `file` e `fingerprint`, criar o índice único parcial e aplicar RLS/revogação, sem preencher evidência histórica.
2. Transformar `bootstrap.sh` em um iniciador do fluxo canônico do MASTER: exigir token e URL do MASTER, solicitar/acompanhar a operação durável e remover toda aplicação SQL direta por `psql`; nenhum segundo executor será criado.
3. Evoluir `delta_manifest.txt` para registrar cada migration em ordem com sua impressão digital; o carregamento do release verificará ordem, quantidade, SHA individual, SHA global e correspondência exata com os blocos de `007_delta_migrations.sql` antes de executar.
4. Ampliar `verify-installation.sql` para conferir o contrato completo do ledger, índice parcial, RLS, ausência de privilégios para `anon`/`authenticated`, tabelas auxiliares e funções críticas do workflow.
5. Atualizar os guardiões e testes de instalação para bloquear: manifesto fora de ordem/adulterado, ledger incompleto, bootstrap com SQL direto, promoção sem validação e divergência entre NEW/UPDATE.
6. Executar lint, verificação de tipos, testes focados, suíte disponível e `master:check` em modo de conferência local.

## Limites e compatibilidade
- Nenhuma chamada ou alteração em Supabase, MASTER, Taveira ou produção.
- Nenhuma reconciliação ou retomada de instalação.
- Nenhuma publicação e nenhum aumento de versão/release nesta etapa.
- Registros legados permanecem `kind='blob'`, com `file`/`fingerprint` nulos; nunca serão promovidos a evidência.
- O resultado ficará como candidato local não publicado. Se a alteração modificar o delta, não será apresentada como release concluída até uma etapa posterior autorizada sincronizar versão e SHA conforme MASTER-first.

## Arquivos previstos
- `src/lib/installation/automation.server.ts`
- `src/lib/installation/runner.server.ts` e/ou entrada segura já existente do fluxo durável
- `supabase/install/bootstrap.sh`
- `supabase/install/report.sh`
- `supabase/install/verify-installation.sql`
- `supabase/baseline-snapshot/tools/build_delta.py`
- `supabase/baseline-snapshot/tools/delta_manifest.txt`
- Testes de instalação relacionados
- `roadmap.md`
