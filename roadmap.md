# Roadmap

# MASTER 1.4.7 — auditoria funcional de Configurações

- Corrigida a navegação responsiva e a indicação ativa da página inicial de Configurações.
- Adicionados estados explícitos de carregamento, vazio e erro com repetição segura nas telas de Configurações.
- Preservadas integralmente as regras existentes de autenticação, RBAC e escopo de workspace.
- Adicionada cobertura de regressão para cards, rotas, permissões e navegação móvel.

## MASTER 1.4.6 — manifesto canônico em instalações legadas

- [x] Preservar o manifesto validado no fluxo moderno de UPDATE.
- [x] Recuperar deterministicamente o manifesto ausente somente para o pacote Client oficial de 85 blocos.
- [x] Bloquear hash, total, conteúdo, identidade ou manifesto divergentes sem alterar checkpoints.
- [ ] Regenerar contratos, executar todos os gates locais e publicar o Master.

## MASTER 1.4.5 — validação das filas de retomada

- [x] Preservar e convergir `_unitos_deferred_sql` antes da validação final.
- [x] Corrigir a separação dos comandos DDL do reparo para impedir SQLSTATE 42601.
- [x] Cobrir fila ausente, legado sem `run_key`, fila vazia e reparo idempotente.
- [x] Regenerar contratos MASTER-first e executar todos os gates locais.
- [ ] Publicar o Master e orientar a retomada oficial sem SQL manual ou novo retry.

## MASTER 1.4.4 — retomada do deployment Vercel

- [x] Corrigir a listagem de deployments para usar `projectId` após resolver o projeto Vercel.
- [x] Preservar a busca por nome antes da resolução e a exigência de Production + Git + SHA exato.
- [x] Tornar o motivo da espera identificável sem expor credenciais ou aceitar outro deployment.
- [ ] Regenerar contratos MASTER-first, executar gates, publicar o Master e acompanhar a operação existente.

## MASTER 1.4.3 — separação Control-plane e pacote Client

- [x] Materializar o bootstrap/convergência Master fora do pacote Client.
- [x] Separar verificadores read-only Client e Master.
- [x] Remover pré-requisitos Control-plane do executor do banco Client.
- [x] Preservar mapa 115 (82 Client, 28 Control-plane, 3 Split, 2 Excluded) e pacote de 85 blocos.
- [x] Sincronizar SHA 1.4.3 e executar todos os gates locais sem NEW, retry real ou publicação.

## MASTER — retry seguro de provision terminal

- [x] Permitir retry contextual de `provision failed` em `update_available` sem ampliar o provisionamento normal.
- [x] Criar nova operação durável vinculada à anterior, preservando histórico, lock, lease e fencing.
- [x] Cobrir elegibilidade, concorrência, imutabilidade, adoção e regressão de UPDATE.
- [x] Regenerar/versionar o pacote e executar testes, tipos, lint, build e `master:check`, sem NEW real ou publicação.

## MASTER — correção da convergência pgvector

- [x] Renomear somente a variável local conflitante do wrapper para `detected_schema`.
- [x] Cobrir ausência, relocação, estado canônico, pós-condição, reexecução e rollback em PostgreSQL local.
- [x] Regenerar e versionar o pacote MASTER-first sem publicar ou executar NEW.
- [x] Executar testes focados, suíte global local/runtime, tipos, lint focado, build e `master:check`; lint global permanece bloqueado por erros preexistentes fora do escopo.

## MASTER — confirmação do vínculo GitHub na Vercel

- [x] Consolidar a leitura do vínculo entre o projeto e `GET /v10/projects/{id}/link`.
- [x] Confirmar por team, tipo GitHub, repositório e branch, tratando `sourceless` apenas como metadado.
- [x] Preservar bloqueios para team, repositório, branch ou vínculo incompatíveis e a idempotência do RESUME.
- [ ] Cobrir os cenários A–F e executar testes focados/de instalação, tipos, lint, build e `master:check`, sem executar NEW ou alterar recursos externos.

## MASTER — criação automática do projeto Vercel no NEW

- [ ] Auditar o lookup atual e comprovar equipe/permissões do token Vercel sem criar recursos reais.
- [ ] Criar ou reutilizar o projeto no team autorizado, bloqueando conflitos de ownership e repositório.
- [ ] Persistir project ID/team ID/vínculo e retomar sem duplicar projeto ou deployment.
- [ ] Preservar READY + SHA autorizado + probe HTTP como condição obrigatória do deployment.
- [ ] Cobrir os nove cenários obrigatórios e executar instalação, suíte global, tipos, lint, build e `master:check`, sem NEW real.

## MASTER 1.4.0 — NEW limpa com pgvector canônico

- [x] Garantir `vector` em `public` quando ausente, instalada em `extensions` ou já em `public`, sem remoção indiscriminada.
- [x] Exigir `public.vector` e `public.vector_cosine_ops` antes de concluir/checkpointar `000_extensions`.
- [x] Cobrir os três estados iniciais e a recusa de checkpoint sem pós-condição.
- [x] Propagar erros internos de blocos `DO`, inclusive SQLSTATE 42710, sem avanço de checkpoint.
- [x] Exigir também `pg_extension.vector` em `public` na pós-condição transacional.
- [x] Validar os estados ausente/`extensions`/`public` em PostgreSQL descartável com pgvector 0.8.2, sem banco externo.
- [x] Executar testes focados/de instalação/globais, tipos, lint focado, build e `master:check`, sem NEW real e sem tocar instalações existentes.

## MASTER 1.4.0 — Deploy Vercel comprovado no NEW

- [ ] Persistir deployment, commit esperado, estado observado e conclusão READY no checkpoint.
- [ ] Retomar pelo deployment existente e validar READY + commit antes do probe HTTP.
- [ ] Tornar fallback por commit idempotente, localizando o deployment correspondente antes de novo disparo.
- [ ] Cobrir estados, timeout, retomada, falso HTTP 200 e ausência de duplicação.
- [ ] Executar testes focados, instalação, suíte global, tipos, lint, build e `master:check`, sem executar NEW real.

## MASTER 1.4.0 — Suíte global confiável

- [x] Autorizar o Master descartável por propósito e referência exatos, bloqueando qualquer outro alvo.
- [ ] Executar e fechar o gate global completo no próprio Master, sem NEW ou chamadas a instalações.
- [x] Separar tempo de infraestrutura, testes locais e integrações remotas.
- [x] Executar testes locais em paralelo sem carregar cleanup remoto.
- [x] Limitar concorrência remota ao grupo de integração e tornar fixtures/cleanup determinísticos.
- [x] Executar a suíte remota completa no projeto `testes`; infraestrutura encerra deterministicamente, com cinco falhas funcionais legadas identificadas.
- [x] Executar suíte local/runtime, tipos, lint dos alterados, build, testes focados e `master:check`.

## MASTER 1.4.0 — Workflow definitivo de instalações

- [x] Mapear integralmente NEW/UPDATE, esperas, retries, timeouts e efeitos externos.
- [x] Versionar explicitamente `start_durable_installation_operation` e validar seu contrato.
- [x] Unificar NEW/UPDATE no executor durável, com evidência idempotente por etapa.
- [x] Limitar retries/esperas e remover falhas silenciosas de persistência/finalização.
- [x] Impedir conclusão/promoção sem migrations, validação, deploy e health comprovados.
- [x] Regenerar pacote MASTER-first v1.4.0 e ampliar a verificação da instalação.
- [x] Cobrir clean install, replay, retomada parcial, falhas externas e manifesto divergente.
- [x] Rodar lint, tipos, testes, build, `master:check` e revisar o diff final.

## Etapa 14 — Pacote e executor canônicos

- [x] Incorporar o contrato aditivo e o hardening de `_unitos_applied_deltas` ao pacote local, sem backfill.
- [x] Remover do `bootstrap.sh` toda execução SQL direta e delegar ao executor durável NEW/UPDATE.
- [x] Validar em runtime ordem, quantidade e integridade do `delta_manifest.txt`.
- [x] Ampliar a verificação do ledger, índice parcial, RLS/grants e objetos críticos.
- [x] Atualizar guardiões e executar lint, tipos, testes e `master:check`, sem publicar ou promover versão.

## MASTER 1.4.6 — Reconciliação segura de instalações legadas

- [x] Inspecionar as 18 migrations ambíguas por contrato SELECT-only e evidência exclusiva.
- [x] Separar estado canônico, compatibilidade parcial e checkpoint externo sem presumir execução histórica.
- [x] Persistir evidências idempotentes no Control-plane com lease/fencing e manter divergências bloqueantes.
- [x] Preservar o pacote Client de 85 blocos sem SQL Control-plane.
- [ ] Publicar somente após revisão do diff e aprovação explícita.

## Etapa 10 — Integração real no Supabase de testes

- [x] Confirmar conectividade e ref exato `limalqnfatlkczshqzgs`, bloqueando MASTER/Taveira.
- [x] Executar os quatro cenários; três passaram e o clean install expôs ledger legado sem colunas de evidência.
- [x] Verificar ledger/evidência e promoção após validação completa após a evolução aditiva validada no projeto de testes.
- [x] Remover todos os artefatos exclusivos do ensaio e comprovar a limpeza.

## P0 — Executor único NEW/UPDATE

- [x] Remover execução direta do delta no bootstrap e falhar fechado sem confirmação canônica.
- [x] Bloquear backfill presumido do ledger e SQLSTATE 23505 como sucesso genérico.
- [x] Impedir promoção de versão sem conclusão comprovada de todas as etapas.
- [x] Fazer o provisionamento NEW aplicar o delta pelo mesmo núcleo canônico do UPDATE.
- [x] Validar instalação limpa, replay parcial, DROP FUNCTION ausente e ausência de evidência.

## Incidente Taveira após retomada 1.3.94

- [x] Pausar imediatamente após regressão observada de 88 para 86/104.
- [x] Remover lease, agendamento, tentativa em execução e itens vivos da fila, preservando evidências.
- [x] Diagnosticar por que a reconciliação monotônica validada não protegeu o progresso exibido: `saveBaselineProgress` reenviava `operation.steps` obsoleto e sobrescrevia 88% com 86%.
- [x] Publicar o MASTER 1.3.95 e retomar a mesma operação após autorização explícita.
- [x] Confirmar avanço monotônico de 86 para 95/104, sem regressão e sem consumir falhas.
- [x] Interromper sem nova tentativa ao encontrar a falha inédita na migration 96/104: DROP de assinatura antiga ausente.
- [x] Corrigir no MASTER a migration 96/104 por pós-condição exata, revisar 97–104, sanear `ALTER DEFAULT PRIVILEGES` multilinha e validar o MASTER 1.3.96.
- [ ] Publicar o MASTER 1.3.96 após autorização explícita; depois solicitar autorização separada para retomar a Taveira em 96/104.

## MASTER 1.3.95 — Confirmação transacional de migrations

- [x] Confirmar a causa exata da regressão 88→86 no caminho real de persistência.
- [x] Criar registro canônico por operação, migration, fingerprint e posição do pacote.
- [x] Tornar a escrita de etapas monotônica no próprio banco.
- [x] Remover o snapshot obsoleto de etapas do checkpoint auxiliar.
- [x] Reconciliar em lote o ledger comprovado do destino sem reduzir progresso.
- [x] Cobrir timeout pós-commit, replay, resposta parcial, concorrência e fencing com o modelo canônico.
- [x] Ensaiar o estado equivalente da Taveira de 88→104 e auditar efeitos.
- [x] Regenerar delta com 112 migrations e sincronizar versão/SHA (`699fc9989650a01338e00aa678b9fe1a0492674c3ba9f7358588eae6eddd9fbb`).
- [x] Executar ensaio no PostgreSQL real: 25→34, não regressão, fencing, pacote divergente e fila legada sem crescimento.
- [x] Desativar a fila legada, cancelar os 92 itens pendentes sem apagar evidências e impedir novas ativações.
- [x] Confirmar `master:check` (49/49), matriz crítica (111/111), tipos, build e verificação final de segurança.
- [x] Publicar e retomar após autorização explícita; operação avançou até 95/104 e parou com segurança na migration 96/104.

## MASTER 1.3.94 — Snapshot imutável do pacote por operação

- [x] Manter a Taveira congelada e sem itens ativos enquanto o pacote é desenvolvido; confirmado `manual_review`, sem lease/agendamento, attempts `running` ou outbox vivo.
- [x] Fixar versão, SHA e total do delta no início da operação e impedir troca durante retomadas.
- [x] Tornar progresso persistido e texto exibido monotônicos usando o snapshot da operação.
- [x] Inventariar todos os caminhos que leem o pacote atual durante uma operação já iniciada.
- [x] Reproduzir 88→87/104, resposta parcial, timeout após gravação e replay com respostas reais.
- [x] Ensaiar integralmente o estado equivalente da Taveira de 81→104 sem regressão ou repetição.
- [x] Executar MASTER-first completo: pacote 1.3.94 com 106 migrations, SHA-256 `3ffeee781e294795577a7297276abbd833b9f80e0b8ec5592231404d7505e2b7`, 48/48 guardiões, 375/375 testes, build e diff limpos.
- [x] Publicar e retomar a Taveira somente após nova autorização explícita.

## MASTER 1.3.93 — Checkpoint canônico e retomada atômica

- [x] Manter a Taveira congelada e provar que nenhuma retomada automática continua ativa.
- [x] Auditar no destino os efeitos reais dos comandos reexecutados; leitura direta confirmou zero duplicidades de jobs, contadores, timers e eventos, sem contadores inconsistentes e com uma única cópia de cada índice/trigger esperado.
- [x] Substituir progresso dividido por checkpoint canônico `operação + migration + fingerprint`.
- [x] Persistir statement e checkpoint na mesma transação do destino; atualizar tentativa sob lease/fencing no MASTER.
- [x] Encerrar tentativas órfãs de forma auditável sem apagar histórico.
- [x] Cobrir crash, replay, resposta vazia/incompatível, checkpoint ausente e fencing divergente.
- [x] Ensaiar integralmente um estado equivalente a 81/103 até 103/103 sem repetir 1–81; validação Banco/Schema real permanece condicionada à retomada autorizada.
- [x] Executar MASTER-first completo e apresentar evidências antes de publicar ou retomar a Taveira.

## Playbook permanente — incidentes de estado ambíguo e retomada

- [x] Documentar o antipadrão erro/timeout/vazio convertido em ausência, cancelamento, sucesso ou zero.
- [x] Exigir varredura completa da superfície afetada na primeira ocorrência, sem correção pontual.
- [x] Exigir matriz tripla baseada na resposta real: erro/timeout, vazio real e resposta válida.
- [x] Exigir ensaio integral com cópia sanitizada do estado real antes de publicar em instalação crítica.
- [x] Exigir auditoria direta de dados para descartar duplicação ou corrupção.
- [x] Exigir congelamento da instalação e fluxo MASTER-first com aprovações separadas para publicar e retomar.
- [x] Ativar o processo como skill interna reutilizável.

## MASTER 1.3.92 — Checkpoints e leituras sem estados ambíguos

- [x] Destravar o checkpoint 25/34 sem reprocessar migrations registradas.
- [x] Separar consulta do marcador interno e rejeitar respostas vazias ou indisponíveis.
- [x] Varrer todo o fluxo de instalações por leituras que confundem vazio real com erro/timeout.
- [x] Corrigir em conjunto todos os pontos críticos encontrados, sem esperar novo incidente.
- [x] Cobrir cada ocorrência com teste comportamental de erro, vazio real e resposta válida.
- [x] Apresentar inventário, correção e matriz tripla de cada ocorrência para revisão do usuário.
- [x] Regenerar pacote, sincronizar versão/SHA e executar todos os guardiões MASTER-first.
- [x] Publicar o MASTER 1.3.92 e retomar a Taveira somente após autorização explícita e revisão das evidências.

## MASTER 1.3.91 — Resiliência comprovada antes da Taveira

- [ ] Corrigir falso cancelamento por leitura vazia/erro de status ou fencing.
- [ ] Cobrir cofre indisponível com teste comportamental.
- [ ] Cobrir timeout, 5xx, 429, conexão e backoff com jitter.
- [ ] Cobrir `data=null + error` sem mascaramento.
- [ ] Cobrir falha do MASTER sem consumo de tentativa do destino.
- [ ] Reproduzir exatamente o falso cancelamento da 1.3.89 e preservar cancelamento/fencing reais.
- [ ] Regenerar pacote, sincronizar versão/SHA e executar todos os guardiões MASTER-first.
- [ ] Publicar e iniciar nova tentativa na Taveira somente após autorização explícita.

## MASTER 1.3.90 — Contenção de privilégios anônimos administrativos

- [x] Revogar `MAINTAIN`, `TRUNCATE`, `TRIGGER` e `REFERENCES` de `anon` em todas as tabelas públicas do MASTER.
- [x] Aplicar e validar o mesmo hotfix diretamente na Taveira como contenção prioritária.
- [x] Preservar somente os acessos públicos funcionais e explícitos necessários.
- [x] Remover do snapshot as heranças anônimas amplas sobre funções e sequências.
- [x] Cobrir a regressão no snapshot e na verificação read-only das instalações.
- [x] Regenerar o pacote, sincronizar versão/SHA e executar os guardiões MASTER-first.
- [ ] Publicar o MASTER e propagar somente após autorização explícita.

## MASTER 1.3.89 — Resiliência das atualizações

- [x] Bloquear regressão de etapas, percentuais e checkpoints diante de leituras falhas ou atrasadas.
- [x] Classificar ausência, timeout, HTTP 5xx, HTTP 429 e falha de conexão nas leituras críticas.
- [x] Aplicar backoff com jitter às leituras da instalação e do cofre.
- [x] Reagendar falhas transitórias do MASTER sem consumir tentativas do destino.
- [x] Distribuir jobs recorrentes ao longo do minuto e registrar duração/resultado da retomada.
- [x] Regenerar pacote, sincronizar versão/SHA e ampliar a verificação do instalador.
- [x] Executar guardiões MASTER-first e conferência final.
- [ ] Publicar o MASTER e liberar a Taveira somente após autorização explícita.

## MASTER 1.3.88 — Retomadas sem consumir tentativas

- [x] Separar retomadas saudáveis de falhas consecutivas no executor.
- [x] Fechar tentativas por fencing token em yield e retry.
- [x] Ampliar o tempo do acionador automático para uma fatia completa.
- [x] Cobrir contador, histórico e timeout com testes de regressão.
- [x] Regenerar o pacote e sincronizar versão/SHA.
- [x] Executar os guardiões MASTER-first e os testes direcionados.
- [ ] Publicar o MASTER e iniciar uma nova atualização da Taveira somente após autorização explícita.

## MASTER 1.3.87 — Consulta vazia no ledger incremental

- [x] Impedir envio de SQL vazio ao preparar o ledger sem seeds.
- [x] Cobrir a regressão que interrompeu a atualização da Taveira.
- [x] Regenerar o pacote, sincronizar versão/SHA e executar os guardiões MASTER-first.
- [x] Publicar o MASTER e retomar a Taveira somente após autorização explícita.

## MASTER 1.3.86 — Desbloqueio da atualização após validação

- [x] Permitir atualização de instalação em erro quando não houver operação ativa.
- [x] Cobrir a transição validação antiga → erro → atualização autorizada.
- [x] Regenerar o pacote, sincronizar versão/SHA e executar os guardiões MASTER-first.
- [x] Publicar o MASTER e acompanhar a Taveira até a validação final.

## MASTER 1.3.85 — P0 de instalação e atualização

- [x] Eliminar sobreposição entre snapshot e delta e bloquear regressões no gerador.
- [x] Remover privilégios perigosos de `anon` do snapshot e validar no instalador.
- [x] Isolar statements adiados por operação, arquivo e fingerprint, com fencing.
- [x] Corrigir ledger por arquivo + fingerprint e semear o ledger em instalações novas.
- [x] Manter ambientes em manutenção durante retry/falha e isolar erros do worker.
- [x] Tornar a geração de secrets atômica e cobrir concorrência.
- [x] Unificar ordem, versão, documentação e verificação do instalador.
- [x] Regenerar o pacote e executar todos os guardiões MASTER-first.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.84 — Compatibilidade antes do delta da Taveira

- [x] Confirmar a falha atual e identificar que a migration corretiva era posterior ao bloqueio.
- [x] Preparar colunas de lease idempotentes antes de ler e aplicar o ledger incremental.
- [x] Cobrir a ordem obrigatória com teste de regressão.
- [x] Regenerar o pacote, sincronizar versão/SHA e executar `master:check`.
- [ ] Publicar o MASTER e iniciar nova tentativa na Taveira somente após autorização explícita.

## MASTER 1.3.83 — Retomada segura da atualização da Taveira

- [x] Reavaliar dependências SQL após cada lote e preservar a fila entre retomadas.
- [x] Registrar SQLSTATE e mensagem original de cada statement adiado.
- [x] Garantir colunas e índice de retomada com migration corretiva idempotente.
- [x] Regenerar o pacote MASTER-first 1.3.83 e sincronizar versão/SHA.
- [ ] Publicar o MASTER e iniciar nova tentativa na Taveira somente após autorização explícita.

## MASTER 1.3.82 — Atualização contínua e progresso real

- [x] Mostrar progresso acumulado entre migrations sem regressão visual para 0%.
- [x] Processar várias migrations pequenas na mesma execução com orçamento seguro.
- [x] Propagar falhas de checkpoint e perda de lease ao executor durável.
- [x] Confirmar o encerramento da tentativa da Taveira e diagnosticar a falha de dependência SQL.
- [x] Regenerar e validar o pacote MASTER-first.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.81 — Orquestração durável das instalações

- [x] Unificar claim, lease, heartbeat e retomada em um único executor do servidor; a tela apenas observa.
- [x] Isolar falhas por instalação, aplicar limite de tentativas e encaminhar casos esgotados para revisão manual.
- [x] Tornar progresso, checkpoints e finalização transacionais e protegidos por fencing token.
- [x] Substituir o delta cumulativo por ledger de migrations individuais, com compatibilidade para instalações existentes.
- [x] Preparar código, aplicar alterações compatíveis, ativar o deploy, validar e registrar a versão em ordem segura.
- [x] Reconciliar banco, commit, deployment, manutenção e versão desejada/publicada.
- [x] Registrar métricas por etapa, tentativa e provedor, com erros classificados e correlação da operação.
- [x] Cobrir concorrência, crash/replay, migrations, provedores e recuperação com testes automatizados.
- [x] Regenerar o pacote MASTER, sincronizar versão/SHA, verificar o instalador e executar `bun run master:check`.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.77 — Detalhe central do Job

- [x] Substituir o painel lateral por modal central, preservando o parâmetro `job` e todas as ações.
- [x] Reorganizar cabeçalho, período, tarefas, briefing e abas contextuais com proporções responsivas.
- [x] Manter Lista/Quadro, timers, comentários, anexos, histórico e navegação existentes.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.73 — Drawer de Jobs

- Drawer de job ampliado sem alterar `/projects/$projectId?tab=jobs&job=<uuid>`.
- Número imutável por workspace, timer direto e estimativa de job.
- Status pesquisáveis de job e tarefa, briefing rico sanitizado e subtarefas.
- Painel lateral com Comentários, Anexos, Timesheet e Histórico.

## MASTER 1.3.74 — Lista de Jobs

- [x] Lista densa com número, progresso, tempo, equipe, prazo, status e ações.
- [x] Agrupamento por status, responsável ou prazo e quadro arrastável por status.
- [x] Duplicação transacional de job e tarefas sem copiar horas, conversas ou anexos.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.75 — Visão geral do projeto

- [x] Cabeçalho compacto com status pesquisável, pauta, responsável e ações preservadas.
- [x] Indicadores canônicos, pipeline contínuo, resumo de jobs, pautas, entregas e atividade real.
- [x] Manter `/projects/$projectId` e todos os parâmetros e abas existentes.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.76 — Lista de Jobs fiel ao padrão de tarefas

- [x] Linha densa com progresso, tempo ativo, equipe, prazo, status pesquisável e menu completo.
- [x] Acessos separados para Jobs e Pautas, grupos de status e quadro alinhados à referência Operand.
- [x] Migrar os status legados para os cinco estados oficiais sem remover status personalizados.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.76 — Fidelidade visual da Lista de Jobs

- [x] Corrigir toolbar, acessos Jobs/Pautas e proporções da linha conforme o HTML de referência.
- [x] Exibir status como pill colorida pesquisável, sem aparência de campo de formulário.
- [x] Preservar busca, filtros, agrupamentos, quadro, drawer e todas as rotas existentes.
- [ ] Publicar e propagar somente após autorização explícita.

## MASTER 1.3.76 — Separação visual de Projeto, Jobs e Pautas

- [x] Remover métricas e etapas editoriais do cabeçalho global do Projeto.
- [x] Manter o pipeline de conteúdo somente na Visão geral e no contexto aberto de Pautas.
- [x] Preservar abas, parâmetros, drawer, filtros e ações existentes.
- [ ] Publicar e propagar somente após autorização explícita.

- [x] Reformular visualmente lista, detalhe e painel de job da área Projetos; preservar ações e sincronizar MASTER 1.3.66.
- [x] Adicionar reenvio/edição de convites e ocultar o Super Admin global de listas e menções; sincronizar MASTER.
- [x] Corrigir conclusão prematura do deploy por Git e reconciliar a versão registrada da Casa 8.
- [ ] Publicar o MASTER 1.3.53 com o diagnóstico correto de domínio/modo de teste/permissão no Resend.
- [x] Corrigir a corrida de redirecionamento em `/admin` que causava `Uncaught undefined`; sincronizar MASTER 1.3.54.
- [x] Corrigir seleção de deployment duplicado da Casa 8, reconciliar a versão comprovada e sincronizar MASTER 1.3.55.
- [x] Corrigir limpeza do modo de manutenção nas retomadas pelo cron, liberar e tentar a atualização da Taveira; MASTER 1.3.56 sincronizado.
- [ ] Concluir a atualização 1.3.56 da Taveira; bloqueada pela hospedagem, que recusou publicação via REST e exige Git.
- [x] Corrigir exclusão de clientes com pipelines, adicionar três confirmações e sincronizar a correção no MASTER.
- [x] Tornar atualizações Git-first, ignorar deployments REST bloqueados e sincronizar o MASTER 1.3.58.
- [x] Corrigir o modal de tarefa que fica carregando quando o item está fora do filtro atual; sincronizar e propagar o MASTER.
- [ ] Corrigir o diagnóstico de validação para separar Banco, Schema, RLS e Seeds; código concluído no MASTER 1.3.60, aguardando publicação para atualizar e revalidar a Apex.
- [x] Evitar tela branca quando a leitura de permissões sofre Gateway Timeout, consultando o Supabase diretamente com identidade protegida.
- [x] Criar automações de WhatsApp por cliente com agenda, eventos, destino padrão, retries e ativação pelo Super Admin.
- [x] Padronizar textos visíveis em PT-BR e datas/horários humanos com fuso de Brasília e segundos; sincronizar MASTER 1.3.63.
- [x] Exibir somente o nome nas menções de comentários e conversas, saneando marcadores técnicos; sincronizar MASTER 1.3.64.
- [x] Publicar o MASTER 1.3.7 e atualizar a Taveira, com validação final.
- [x] Tornar a ação de atualização inequívoca e proteger o reprovisionamento na tela.
- [x] Concluir Lixeira de conteúdos/pipelines com retenção de 30 dias e propagação MASTER.
- [x] Corrigir confirmação de nome no primeiro acesso e validar nos dois portais.
- [x] Dupla confirmação por escrito nas ações de risco do nível master (instalações, exclusões, configurações globais, usuários/permissões) com auditoria em `critical_action_events`. MASTER 1.3.12.
- [x] Corrigir definitivamente contas sem perfil no primeiro acesso, com autorreparo, convites verificados e propagação MASTER 1.3.13.
- [x] Validar o Supabase Access Token contra o projeto e as permissões necessárias antes de salvar/provisionar; propagar no MASTER 1.3.28.
- [x] Acelerar a publicação no GitHub, reaproveitar a árvore do MASTER e tornar atualizações retomáveis; propagar no MASTER 1.3.30.
- [x] Tornar instalações novas template-only, recuperar com segurança repositórios técnicos incompletos e propagar no MASTER.
- [x] Remover a exigência de exclusão na recuperação GitHub: preservar README legado em backup arquivado, com rollback seguro.
- [x] Eliminar também a exigência de renomear repositórios: preservar o legado intacto e criar/registrar automaticamente um destino operacional alternativo.
- [x] Corrigir o vínculo com a Vercel após adoção do template: descobrir automaticamente a equipe dona do projeto e explicar acessos insuficientes.

## 1.3.37 — Casa 8: acessos conferidos antes de publicar

- Cópia do template apenas desatualizada passa a ser sincronizada (antes bloqueava).
- Preflight de publicação/repositório: 401/403/limite = interrompe com a permissão exata; 502/503/504 = temporário.
- Operações sem resposta são encerradas automaticamente (nada fica "em andamento").
- "Testar acesso" informa OK ou a lista exata do que falta.

## 1.3.40 — Instalador stage-gated e BYOK completo

- [x] Aceitar chaves Supabase informadas manualmente quando o token não pode revelá-las.
- [x] Validar Supabase, GitHub e Vercel antes de alterar banco ou publicar código.
- [x] Abrir provisionamento, validação e atualização com lock atômico no banco.
- [x] Exigir build concluído e relatório final aprovado antes de registrar a versão.
- [x] Aumentar a lease e impedir sucesso com etapas pendentes.
- [ ] Publicar o MASTER e executar novamente a Casa 8; bloqueado até autorização externa.

## 1.3.42 — Nome canônico do projeto de publicação

- [x] Reconhecer somente equivalência exata e única entre o nome cadastrado e projetos visíveis na Vercel.
- [x] Corrigir automaticamente `unitos-casa8` para o nome real `unitos-casa-8` após validar o acesso.
- [x] Reutilizar o nome confirmado em todas as etapas seguintes de publicação.
- [ ] Publicar o MASTER e executar “Testar acesso” na Casa 8; depende da sessão do Super Admin.

- [x] Reformular a apresentação do plano de mídia em cartões, planilha enxuta e painel lateral; manter os 12 campos e funções.

- [x] Reformular apresentação de Pautas (/monthly-plan e detalhe), preservar todas as funções e adicionar seleção segura de modelo no assistente.
- [x] Reformular apenas a apresentação de Conteúdo (/content), preservando Kanban, lista, seleção e editor completos.
- [x] Reorganizar Jobs & Pautas, criar quadro de jobs e drawer com Lista/Quadro de tarefas; sincronizar no MASTER 1.3.69.
- [x] Impedir tela de erro quando o contador de mensagens roda durante perda ou renovação da sessão; sincronizar no MASTER 1.3.70.
- [x] Eliminar bloqueios falsos de token nas instalações, unificar a leitura do cofre no runtime e distinguir acesso ausente de ilegível; sincronizar no MASTER 1.3.71.
- [ ] Tornar criação, atualização, retomada e validação de ambientes resistentes a concorrência e diagnóstico incorreto; implementação e validação automatizada do MASTER 1.3.72 concluídas (297 testes de instalação + 41 guardiões), pendentes apenas publicação autorizada, ensaio descartável real e recuperação/revalidação da Apex.
