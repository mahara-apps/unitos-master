# P0 — Unificação segura de NEW e UPDATE

## Objetivo
Eliminar o executor paralelo do bootstrap sem tocar em produção ou na Taveira. NEW e UPDATE passarão pelo mesmo núcleo de migrations, com checkpoint, evidência verificável, retomada e validação antes de promover versão.

## Implementação
1. Extrair o núcleo compartilhado do executor de migrations para um módulo server-safe, preservando manifesto fixado, ordem, fingerprint, checkpoint e classificação de falhas.
2. Alterar o fluxo NEW do Master para usar esse núcleo, em vez de aplicar o delta como um arquivo cumulativo e depois semear o ledger.
3. Tornar o `bootstrap.sh` um encaminhador para o executor seguro; remover qualquer `psql -f 007_delta_migrations.sql` e falhar fechado se o contexto durável exigido estiver ausente.
4. Remover o backfill presumido do ledger: migration histórica só será reconhecida com evidência verificável; ausência, leitura parcial ou divergência permanece pendente/bloqueada.
5. Remover `23505` da lista genérica de sucessos; duplicidade somente será aceita quando uma pós-condição específica comprovar o estado esperado.
6. Impedir promoção de `current_version`/release enquanto banco, código, deployment e validação final não estiverem comprovados.
7. Preservar leitura e retomada dos checkpoints/ledgers existentes, sem reclassificar automaticamente instalações legadas.

## Testes e validação
- Instalação limpa pelo executor compartilhado.
- Replay após falha parcial, sem reexecutar o que possui evidência válida.
- `DROP FUNCTION` com assinatura inexistente tratado pela pós-condição exata.
- Ausência de evidência bloqueia conclusão e promoção de versão.
- Guardião garantindo que `bootstrap.sh` não execute o delta diretamente.
- Rodar lint, typecheck, testes focados, suíte disponível e `bun run master:check`.

## Limites
- Nenhuma migration será aplicada ao Supabase nesta etapa.
- Nenhum reconcile/update será executado na Taveira.
- Nenhuma publicação será feita.
