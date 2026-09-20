## Atualização determinística das instalações
- [x] Unificar a fonte canônica de versão e reconciliação.
- [x] Endurecer executor, retomada, leases e estados terminais.
- [x] Tornar promoção de versão e finalização UPDATE atômicas e fenced.
- [x] Cobrir política de pending/running expirado/failed/manual_review/updating inconsistente.
- [x] Ensaiar finalização, concorrência e ledger em PostgreSQL efêmero.
- [ ] Cobrir os cenários de aceitação solicitados.
- [ ] Regenerar pacote e validar MASTER-first.
- [ ] Executar testes focados, suíte global, typecheck, lint, build e ensaio PostgreSQL isolado.

## Protocolo de backup do Master
- [x] Exigir evidência de backup restaurável para escritas compartilhadas.
- [x] Permitir exceção explícita somente por instalação descartável identificada.
- [x] Preservar autorizações e proteções fail-closed independentes do backup.
- [x] Validar testes focados e master:check.
- [ ] Validar typecheck, lint e build.
