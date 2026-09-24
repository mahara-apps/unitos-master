## Substituição segura de modelos de IA

- [x] Remover modelos descontinuados dos defaults e fallbacks compilados.
- [x] Priorizar sucessores compatíveis com o mesmo papel e família.
- [x] Promover override somente depois de uma geração real bem-sucedida.
- [x] Fazer o health check validar o candidato antes da troca.
- [x] Executar testes focados e validar tipos/qualidade da nova versão.
- [ ] Executar suíte global e concluir o fluxo MASTER-first da versão 1.4.34.
- [ ] Publicar e propagar somente após autorização explícita.

## Comentários com menções

- [x] Confirmar que o bloqueio vinha da execução do gatilho com privilégio do usuário.
- [x] Tornar somente o gatilho `sanitize_mention_body` privilegiado e manter as funções sem acesso direto.
- [x] Aplicar a correção no MASTER sem ampliar RBAC/RLS.
- [x] Selar e validar o pacote MASTER 1.4.35.
- [ ] Publicar e propagar somente após autorização explícita.

## Envio de mensagens pelo teclado

- [x] Enviar mensagens com Enter no campo principal.
- [x] Preservar Shift+Enter para quebra de linha e Enter para selecionar menções abertas.
- [x] Validar tipos, qualidade e compilação; teste autenticado indisponível por Supabase externo.
- [x] Manter a alteração no pacote MASTER 1.4.35.

## Mensagens lidas e não lidas

- [x] Reutilizar o controle canônico de última leitura e contagem por conversa.
- [x] Exibir contador nas abas, conversas e menu lateral, com limite visual `99+`.
- [x] Identificar conversas lidas e destacar conversas não lidas na listagem.
- [x] Atualizar contadores em tempo real e marcar leitura somente após carregar o histórico.
- [x] Validar testes, compilação e fluxo MASTER-first da versão 1.4.36.

## Consulta do commit do MASTER no GitHub

- [x] Confirmar o HTTP 403 causado pela ausência de `User-Agent`.
- [x] Padronizar os cabeçalhos da leitura autenticada e pública.
- [x] Cobrir a regressão com teste das duas tentativas.
- [x] Regenerar o pacote MASTER 1.4.32 e executar validações finais.
- [ ] Publicar somente com autorização explícita.

## Resend institucional por instalação

- [x] Confirmar divergência entre chave, remetente, indicador e envio.
- [x] Criar armazenamento cifrado e protegido por instalação.
- [x] Unificar salvamento, estado exibido, validação de domínio e envio.
- [x] Restringir alteração a SUPER ADMIN e remover fallback legado.
- [x] Cobrir configuração pronta, pendente, ausente e ilegível.
- [x] Regenerar pacote e sincronizar a versão 1.4.31.
- [x] Executar `master:check` e validações finais.
- [ ] Publicar somente com autorização explícita.
- [x] Diagnosticar privilégios herdados na instalação 1.4.28 sem alterar dados.
- [x] Aplicar hardening retroativo no MASTER e defaults seguros para novas tabelas.
- [x] Eliminar cache obsoleto, auditar alterações e deduplicar retries no provedor.
- [ ] Validar e selar o pacote MASTER 1.4.33.
- [ ] Atualizar primeiro `unitos-new-teste-02` após autorização de publicação.

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

- [x] Aplicar política fail-closed para deferred/interrupted e leases residuais.
- [x] Remover falsos PASS dos preflights e cobrir contadores inválidos.
- [x] Ensaiar promoção, cron 37, concorrência e comando legado em PostgreSQL/shell local.
- [x] Bloquear explicitamente divergências entre versões e hashes Master/Client e Control-plane.
- [x] Executar validação local completa sem qualquer ação remota.

## Finalização operacional do Master 1.4.19

- [x] Classificar e remover código/testes Master redundantes, obsoletos, sem uso ou contraditórios.
- [x] Consolidar NEW, UPDATE, retomada, freeze, fencing, promoção e cron 37 em um fluxo único.
- [x] Corrigir vinculação de hashes, convergência isolada e política coerente de leases.
- [x] Reduzir `master:check` aos comportamentos operacionais essenciais sem retirar garantias de segurança.
- [x] Regenerar artefatos MASTER-first e validar fluxo integrado localmente.
- [x] Documentar arquivos removidos/mantidos, comandos e próxima ação remota única.

## Remetente institucional do Resend

- [x] Rastrear a fonte central e confirmar o remetente legado por workspace.
- [x] Corrigir a classificação do erro 403 do modo de teste do Resend.
- [x] Impedir fallback silencioso para `onboarding@resend.dev` e remetente legado do workspace.
- [ ] Verificar `pitada.digital` no Resend e registrar `unitos@pitada.digital` no singleton da instalação — bloqueado pelos registros DNS pendentes.
- [ ] Confirmar envio real para destinatário externo — bloqueado até a verificação DNS.

## Alinhamento operacional do Control-plane 1.4.20

- [x] Alinhar promoção, ativação exclusiva do cron 37 e ensaios locais à versão autorizada 1.4.20.
- [x] Regenerar os artefatos canônicos MASTER-first e validar a coerência local completa.
- [x] Manter ambiente remoto, recovery, cron e operação Apex intactos.

## Compatibilidade do pacote Client após o bloco 85

- [x] Separar o trecho legado reconciliável (posições 1–85) do tamanho atual do pacote canônico.
- [x] Manter os blocos 86 e 87 fora da promoção legada para execução normal pelo executor.
- [x] Regenerar os artefatos MASTER-first e validar localmente antes de publicar.
- [x] Publicar a versão 1.4.21 após autorização explícita.
- [x] Diagnosticar sem escrita o bloqueio real da Taveira após a publicação.
- [x] Preservar identidades incrementais legadas registradas no rótulo e impedir reconciliação heurística sobre migrations posteriores.
- [x] Regenerar e validar a versão 1.4.22 pelo fluxo MASTER-first.
- [x] Publicar a versão 1.4.22 somente após nova autorização explícita.

## Reconciliação cumulativa das instalações legadas

- [x] Comparar cada posição histórica somente com o estado canônico acumulado até ela.
- [x] Preservar as posições 71 e 84 como verificações fail-closed do estado real.
- [x] Regenerar e validar a versão 1.4.24 pelo fluxo MASTER-first.
- [ ] Reexecutar a suíte global com credenciais válidas do projeto de integração; execução atual bloqueada por `Invalid API key` e pré-condições remotas ausentes.
- [ ] Publicar somente após nova autorização explícita.

## Novas instalações sem legado

- [x] Abandonar a substituição vinculada: os ambientes novos não reaproveitam instalações antigas.
- [x] Impedir que um token limitado bloqueie a leitura pública do commit do MASTER (1.4.25).
- [x] Aplicar ao botão Nova instalação o formulário em etapas, derivando projeto, publicação e repositório automaticamente.
- [x] Exigir projeto Supabase realmente vazio e remover o fluxo vinculado de substituição antiga.
- [x] Regenerar os artefatos 1.4.26 e aprovar `master:check`, tipos, lint alterado e build.
- [ ] Revalidar a suíte global quando a chave do projeto de integração deixar de responder `Invalid API key`.
- [ ] Remover os recursos e o histórico técnico antigos na ordem segura, sem reaproveitar migrations legadas.
- [x] Criar e provisionar uma instalação nova diretamente na versão MASTER vigente.
- [ ] Validar RBAC, RLS, autenticação, domínio e identidade institucional antes da liberação.

## Primeiro deployment das instalações novas

- [x] Impedir deployment REST sem projeto e repoId confirmados.
- [x] Encaminhar recusas atuais da Vercel para o fallback Git idempotente.
- [x] Regenerar e validar a próxima versão pelo fluxo MASTER-first.
- [ ] Publicar somente após autorização explícita e então repetir o provisionamento.

- [x] Concluir domínio como pendência não bloqueante e retry com herança segura de checkpoints.
- [x] Corrigir a troca de deployment REST posteriormente bloqueado para o fallback Git idempotente.
- [x] Validar e preparar o MASTER 1.4.29 pelo fluxo MASTER-first.
- [x] Publicar o MASTER 1.4.29 após autorização explícita.
- [x] Corrigir na 1.4.30 a retomada para herdar o commit Git revalidável e nunca recriar REST quando ele existir.
- [x] Validar a 1.4.30 pelo fluxo MASTER-first, com tipos, qualidade e cenários focados aprovados.
- [ ] Publicar o MASTER 1.4.30 somente após autorização explícita.
- [ ] Depois da publicação, permitir nova tentativa na Apex preservando todos os checkpoints confirmados.
