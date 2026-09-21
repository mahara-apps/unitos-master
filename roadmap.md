## Atualização determinística das instalações

- [x] Unificar a fonte canônica de versão e reconciliação.
- [x] Endurecer executor, retomada, leases e estados terminais.
- [x] Tornar promoção de versão e finalização UPDATE atômicas e fenced.
- [x] Cobrir política de pending/running expirado/failed/manual_review/updating inconsistente.
- [x] Ensaiar finalização, concorrência e ledger em PostgreSQL efêmero.
- [x] Cobrir os cenários de aceitação solicitados.
- [x] Regenerar pacote e validar MASTER-first.
- [x] Executar testes focados, master:check, typecheck, lint alterado, build e ensaio PostgreSQL isolado.

## Gates locais Master 1.4.19

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

## Revisão do gate global sem backup bloqueante

- [x] Substituir exceção descartável por aceitação global vinculada ao Master existente.
- [x] Exigir confirmação literal, identidade canônica, operador, risco específico e auditoria JSONL.
- [x] Preservar autorizações próprias, preflight, freeze, fencing, ledger e fail-closed.
- [x] Executar testes focados, master:check, typecheck, lint alterado e build.
- [x] Manter todos os ambientes remotos intactos.

## Preflight local da instalação do freeze 1.4.19

- [x] Separar tentativas históricas terminais de atividade real sem alterar histórico.
- [x] Bloquear leases, concorrência, vínculos órfãos e estados desconhecidos.
- [x] Validar autorização, projeto e conexão antes do gate auditável.
- [x] Exigir destino JSONL absoluto e impedir exposição de conexão ou justificativa.
- [x] Executar validação local completa.

## Gate do freeze global

- [x] Conectar freeze e unfreeze ao gate de backup com escopo global.
- [x] Rejeitar exceção descartável e argumentos adicionais no comando global.
- [x] Preservar autorização própria, preflight transacional, geração e fencing.
- [x] Registrar evidência não secreta em JSONL e manter status somente leitura.
- [x] Executar validação local completa sem acesso remoto.

## Execução definitiva — Etapa 1 somente leitura

- [x] Revalidar identidade do Control-plane e da instalação Apex.
- [x] Conferir Master 1.4.19 e hashes locais.
- [x] Confirmar cron 37 inativo e versões current/pinned/produção.
- [x] Conferir ledger 1.4.10, 1.4.11 e recovery 1.4.14.
- [x] Inventariar objetos remotos de freeze e executor.
- [x] Verificar integralmente a operação Apex, tentativas, efeitos, migrations, passos e leases.
- [x] Identificar operações concorrentes, running e stale sem alterar estado.
- [x] Emitir resultado objetivo PASS ou BLOCK: BLOCK por freeze/executor ausentes e versão de produção não comprovável.

## Reparação controlada do Control-plane

- [x] Criar contrato versionado e fail-closed do plano 1.4.19.
- [x] Expor relatório somente leitura para Super Admin no MASTER.
- [x] Criar tela com bloqueios, gates, ordem, rollback e validações.
- [x] Preservar explicitamente a operação Apex e impedir controles de execução.
- [x] Executar validações locais completas sem ação remota.

## Desbloqueio operacional Control-plane 1.4.19

- [x] Permitir freeze global preservando operações pending sem lease e histórico terminal.
- [x] Permitir instalação isolada do executor com pending legítima preservada.
- [x] Permitir recovery 1.4.14 sem reivindicar ou editar pending preservada.
- [x] Criar ato mínimo e autorizado para ativar exclusivamente o cron 37 após validação.
- [x] Separar convergência, freeze, executor e recovery em atos independentes.
- [x] Implementar promoção atômica própria do Control-plane após validações.
- [x] Regenerar artefatos MASTER-first e executar validações locais completas.

## Painel operacional de instalações

- [x] Extrair operação ativa, histórico e estado publicado sem duplicar o executor.
- [x] Expor tentativas, lease, heartbeat, fencing e checkpoints somente para leitura.
- [x] Validar testes, typecheck, lint, build e fluxo MASTER-first local.

## Compatibilidade histórica e validação local do Control-plane

- [ ] Catalogar estados e aplicar política fail-closed para deferred/interrupted e leases residuais.
- [ ] Remover falsos PASS dos preflights e cobrir contadores inválidos.
- [ ] Ensaiar promoção, cron 37, concorrência e comando legado em PostgreSQL/shell local.
- [ ] Bloquear explicitamente divergências entre versões e hashes Master/Client e Control-plane.
- [ ] Executar validação local completa sem qualquer ação remota.

## Finalização operacional do Master 1.4.19

- [ ] Classificar e remover código/testes Master redundantes, obsoletos, sem uso ou contraditórios.
- [ ] Consolidar NEW, UPDATE, retomada, freeze, fencing, promoção e cron 37 em um fluxo único.
- [ ] Corrigir vinculação de hashes, convergência isolada e política coerente de leases.
- [ ] Reduzir `master:check` aos comportamentos operacionais essenciais sem retirar garantias de segurança.
- [ ] Regenerar artefatos MASTER-first e validar fluxo integrado localmente.
- [ ] Documentar arquivos removidos/mantidos, comandos e próxima ação remota única.
