# Padrão do workspace para produção de conteúdo (com exceção por cliente)

## Respostas à análise (estado atual confirmado)
1. **Kanban de produção**: hoje cada cliente tem seu próprio quadro de etapas; não existe padrão para todos. **Regra de aprovação**: o sistema já sabe ler um padrão do workspace (cliente → workspace → padrão histórico), mas não há tela para defini-lo — só por cliente.
2. **Status de produção de conteúdo**: não existe; os status de trabalho cobrem só Projetos, Tasks e Sub-tasks.
3. **Alternativa até sair**: aplicar manualmente o mesmo quadro e a mesma regra em cada cliente.
4. Registrado como recurso: padrão global com exceção por cliente.

## O que será feito (em fases, uma de cada vez)

### Fase A — Regra de aprovação padrão do workspace
- Em Configurações, novo bloco "Regras de produção": Pauta / Conteúdo / Agenda com "Cliente aprova" ou "Time avança direto", e limite de produção (avisar/bloquear).
- Na ficha do cliente, cada regra mostra "Segue o padrão do workspace" ou "Exceção deste cliente", com botão "Voltar ao padrão".
- Ao mudar o padrão: mostra quantos clientes serão afetados e quantos itens estão aguardando o cliente, com a mesma confirmação "Liberar agora / Manter aguardando" que já existe.
- Só Owner/Admin alteram; Manager/User veem.

### Fase B — Quadro de produção padrão do workspace
- Em Configurações, "Etapas de produção": editar o modelo de etapas (nome, cor, ordem, SLA, final, visível no portal, link de aprovação).
- Clientes novos nascem com o padrão.
- "Aplicar a todos os clientes": prévia por cliente (etapas adicionadas, renomeadas, peças que mudariam de coluna) e opção de manter clientes com exceção. Etapas com peças nunca são apagadas sem escolher para onde as peças vão.
- Cliente pode marcar seu quadro como exceção; a tela mostra se está igual ao padrão.

### Fase C — Status de produção de conteúdo
- Novo grupo "Produção de conteúdo" em Status de trabalho, ligado às etapas do padrão, com a marca "conta como concluído" para os relatórios enxergarem o fim da esteira.

## Detalhes técnicos
- A: reutiliza `brands.approval_policy`/`scope_policy` já lidos por `client-policy.server.ts`; nova função de gravação do workspace (Owner/Admin, checagem no servidor + RLS); "voltar ao padrão" remove a chave no cliente. Sem migration se as colunas já tiverem GRANT/RLS adequados (verificar primeiro).
- B: migration aditiva — modelo de pipeline do workspace (`content_pipelines` com `client_id` nulo ou tabela de template) + `follows_brand_default` por cliente; propagação via RPC transacional idempotente com prévia; GRANT explícito, RLS, revogar anon/PUBLIC.
- C: novo escopo `content` em `work_statuses` mapeado às etapas.
- Cada fase: testes das regras (herança, exceção, propagação sem perder peças, permissão), MASTER-first (delta, versão, verify, `master:check`). Nada publicado sem autorização.
