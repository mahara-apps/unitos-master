# Roadmap

## MASTER 1.3.92 — Checkpoints e leituras sem estados ambíguos

- [ ] Destravar o checkpoint 25/34 sem reprocessar migrations registradas.
- [ ] Separar consulta do marcador interno e rejeitar respostas vazias ou indisponíveis.
- [ ] Varrer todo o fluxo de instalações por leituras que confundem vazio real com erro/timeout.
- [ ] Corrigir em conjunto todos os pontos críticos encontrados, sem esperar novo incidente.
- [ ] Cobrir cada ocorrência com teste comportamental de erro, vazio real e resposta válida.
- [ ] Regenerar pacote, sincronizar versão/SHA e executar todos os guardiões MASTER-first.
- [ ] Publicar e retomar a Taveira somente após autorização explícita.

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
