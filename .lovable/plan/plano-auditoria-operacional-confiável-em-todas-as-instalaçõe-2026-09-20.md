# Plano — Auditoria operacional confiável em todas as instalações

## Objetivo
Transformar **Configurações → Auditoria** em uma central confiável para diagnosticar falhas reais do sistema, disponível para **Owner e Admin** do workspace, com retenção de **90 dias** e propagação obrigatória pelo pacote MASTER.

## Diagnóstico confirmado
- O painel atual não é um log de sistema: ele agrega apenas `activity_events`, `notifications` e, em outra tela, `ai_jobs`.
- Erros importantes de e-mail, cron, webhooks, instalação e partes da IA ainda podem existir somente nos registros efêmeros do servidor e não aparecer no painel.
- `critical_action_events`, `message_logs` e `user_login_events` não integram a consulta atual de Auditoria.
- A consulta de notificações não filtra explicitamente o workspace selecionado, e notificações não possuem escopo de cliente no resultado.
- Consultas das fontes atuais descartam seus erros individuais; uma fonte indisponível pode parecer apenas “sem registros”.
- Sem workspace selecionado, o painel também exibe um vazio genérico, em vez de explicar a ausência de contexto.
- A proteção da tela e algumas políticas atuais não expressam exatamente a regra escolhida de acesso somente para Owner/Admin.
- Não existe retenção de 90 dias para as fontes atuais do painel.

## Implementação

### 1. Registro canônico de eventos do sistema
- Criar uma tabela append-only para eventos operacionais, com: horário, severidade, categoria, origem, operação, resultado, código seguro do erro, mensagem sanitizada, workspace, cliente quando aplicável, ator, correlação, tentativa e metadados controlados.
- Proibir segredos, tokens, credenciais, conteúdo sensível e dados pessoais desnecessários; limitar tamanho dos campos e metadados.
- Escrita somente pelo servidor/service role e leitura somente por Owner/Admin do workspace, preservando Super Admin conforme a autoridade institucional existente.
- Impedir alteração de registros; permitir apenas inserção controlada e expurgo automático após 90 dias.
- Criar índices para período, severidade, categoria, workspace, cliente e correlação.

### 2. Produtor único e confiável
- Criar um único serviço server-side para registrar eventos com validação de escopo, sanitização, classificação e correlação.
- Registrar sucesso, aviso e falha nos fluxos prioritários: envio de e-mail/mensagens, cron e workers, webhooks, IA, integrações externas e operações de instalação.
- Preservar as tabelas especializadas existentes como fonte detalhada; o evento canônico aponta para seus identificadores, sem duplicar payloads sensíveis.
- Falhas do próprio registro ficam visíveis no log da plataforma e não transformam uma operação concluída em falha; fluxos críticos terão testes que comprovem a tentativa de auditoria.

### 3. Consulta fiel e estados explícitos
- Substituir o agregador parcial por uma consulta paginada que una, com origem identificada, eventos de sistema, ações humanas críticas, mensagens e jobs relevantes.
- Filtrar todas as fontes explicitamente pelo workspace e aplicar cliente apenas quando houver vínculo real.
- Não converter erro de uma fonte em lista vazia: retornar saúde por fonte (`disponível`, `indisponível`, `parcial`) e mostrar aviso claro de dados incompletos.
- Separar claramente “nenhum evento”, “workspace não selecionado”, “sem permissão” e “falha ao consultar”.
- Padronizar datas no fuso oficial `America/Sao_Paulo`, mantendo armazenamento UTC.

### 4. Painel de Auditoria
- Organizar a tela em visões **Sistema**, **Ações**, **Mensagens** e **IA**, com filtro por período, severidade, categoria, cliente, origem, texto e correlação.
- Exibir KPIs com `PageKpi`/`PageKpiGrid`: total, erros, avisos, fontes indisponíveis e última ocorrência.
- Mostrar causa sanitizada, contexto, horário absoluto e relativo, origem e ID de correlação; permitir copiar evidência sem expor segredos.
- Manter **Acessos** como área própria, sem misturar tentativas de login com falhas operacionais.
- Corrigir a navegação para que apenas Owner/Admin vejam e consultem Auditoria e Acessos.

### 5. Padrão MASTER-first
- Criar a migration no MASTER com tabela, grants, RLS, policies, índices, expurgo e agendamento seguro.
- Incluir schema e código no pacote Client; regenerar o delta oficial.
- Atualizar `delta_version.txt` e `MASTER_RELEASE_VERSION` com a mesma versão/hash.
- Ampliar `verify-installation-client.sql` para validar tabela, colunas, grants, RLS, policies, índices e retenção.
- Preservar NEW/UPDATE, RBAC/RLS/auth e separação Master × Client; nenhuma instalação será alterada ou publicada sem autorização posterior.

## Testes e validação
- Unitários: sanitização, classificação, correlação, filtros, paginação, erro parcial e estados vazio/sem workspace.
- Integração PostgreSQL: Owner/Admin permitidos; Manager/User/Portal e cross-workspace bloqueados; cliente fora do escopo bloqueado; escrita direta negada; registros imutáveis; expurgo limitado a mais de 90 dias.
- Produtores: falha e sucesso geram o evento correto sem salvar segredo; erro ao registrar não mascara o resultado original.
- Interface: fontes indisponíveis aparecem como aviso, filtros preservam o escopo e KPIs usam o padrão oficial.
- MASTER-first: testes de completude/sincronia, `bun run master:check`, testes afetados, suíte global, typecheck, lint e build, sem ampliar timeout nem ignorar falhas.

## Limites desta etapa
- Não importar automaticamente logs históricos efêmeros do provedor de hospedagem.
- Não executar UPDATE/NEW/retry/P0, migrations remotas, publicação ou deploy sem autorização explícita separada.
