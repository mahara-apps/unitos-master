## Atualização determinística das instalações
- [x] Unificar a fonte canônica de versão e reconciliação.
- [x] Endurecer executor, retomada, leases e estados terminais.
- [x] Tornar promoção de versão e finalização UPDATE atômicas e fenced.
- [x] Cobrir política de pending/running expirado/failed/manual_review/updating inconsistente.
- [x] Ensaiar finalização, concorrência e ledger em PostgreSQL efêmero.
- [x] Cobrir os cenários de aceitação solicitados.
- [x] Regenerar pacote e validar MASTER-first.
- [x] Executar testes focados, master:check, typecheck, lint alterado, build e ensaio PostgreSQL isolado.

## Gates locais Master 1.4.18
- [x] Selar o inventário de freeze e executor determinístico.
- [x] Separar a instalação do executor com backup, identidade, autorização e preflight próprios.
- [x] Bloquear promoção com ledger fora de ordem, lacunas ou fingerprints inválidos.
- [x] Criar diagnóstico offline de versões sem rede nem inferências.
- [x] Cobrir a evidência de reconciliação pelo freeze global.

## Protocolo de backup do Master
- [x] Exigir evidência de backup restaurável para escritas compartilhadas.
- [x] Permitir exceção explícita somente por instalação descartável identificada.
- [x] Preservar autorizações e proteções fail-closed independentes do backup.
- [x] Validar testes focados e master:check.
- [x] Validar typecheck e build; lint dos arquivos alterados.
- [ ] Lint global bloqueado por erros preexistentes fora deste protocolo.

## Gate do freeze global
- [x] Conectar freeze e unfreeze ao gate de backup com escopo global.
- [x] Rejeitar exceção descartável e argumentos adicionais no comando global.
- [x] Preservar autorização própria, preflight transacional, geração e fencing.
- [x] Registrar evidência não secreta em JSONL e manter status somente leitura.
- [x] Executar validação local completa sem acesso remoto.

## Execução definitiva — Etapa 1 somente leitura
- [x] Revalidar identidade do Control-plane e da instalação Apex.
- [x] Conferir Master 1.4.18 e hashes locais.
- [x] Confirmar cron 37 inativo e versões current/pinned/produção.
- [x] Conferir ledger 1.4.10, 1.4.11 e recovery 1.4.14.
- [x] Inventariar objetos remotos de freeze e executor.
- [x] Verificar integralmente a operação Apex, tentativas, efeitos, migrations, passos e leases.
- [x] Identificar operações concorrentes, running e stale sem alterar estado.
- [x] Emitir resultado objetivo PASS ou BLOCK: BLOCK por freeze/executor ausentes e versão de produção não comprovável.
