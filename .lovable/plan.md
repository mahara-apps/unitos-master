# Correção integral das rotinas de IA — MASTER-first

## Objetivo

Corrigir no MASTER quatro pontos da auditoria sem alterar RBAC, RLS, autenticação ou conteúdo já concluído:

1. health check isolado por workspace;
2. recuperação automática de peças presas em geração;
3. contrato portátil e tolerante do roteirista;
4. Copilot em pt-BR e com saída validada.

A substituição da chave Groq será uma ação administrativa separada. Nenhuma chave será incluída no pacote, alterada por migration ou tratada como correção de código.

## Situação confirmada

- O health check atual escolhe a chave mais recente de cada provedor sem filtrar `brand_id` e propaga o resultado a todas as conexões daquele provedor.
- `ai_model_health` registra provedor/papel/modelo, mas ainda não identifica o workspace.
- A fila de legendas já possui trigger de ativação, execução imediata e drain temporário; porém, `copy_running` não dispara o trigger e o drain pode ser desligado enquanto uma execução ainda está viva. Assim, uma peça que fique órfã depois pode permanecer presa.
- O roteirista usa o parser compartilhado de campo único, mas as falhas reais recentes de `invalid_output` exigem fixtures fiéis antes de ampliar a recuperação.
- O Copilot pede o idioma do briefing, aceita texto bruto quando o JSON falha e não está coberto pelo guardião global de pt-BR.

## Plano de implementação

### 1. Health check por workspace

- Evoluir o histórico de saúde para identificar `brand_id`, preservando os registros antigos como histórico global/legado.
- Enumerar somente combinações reais `workspace + provedor + credencial` e descriptografar cada chave isoladamente.
- Testar a chave e os modelos de cada workspace sem reutilizar o resultado de outro workspace.
- Atualizar apenas `brand_connections.providers` do workspace testado.
- Manter o catálogo de modelos global, mas promover um sucessor somente após confirmação compatível; uma credencial inválida de um workspace não poderá descontinuar nem promover modelo global.
- Notificar administradores com o workspace afetado e sem expor chave ou resposta sensível.
- Ajustar o painel para apresentar a verificação mais recente do contexto correto, preservando a visão global de catálogo para Super Admin.

### 2. Reaper durável das peças

- Manter a arquitetura existente de trigger + drain temporário, sem criar polling permanente quando a fila estiver vazia.
- Fazer o drain considerar como trabalho pendente tanto fases retomáveis quanto `copy_running` ainda dentro da janela de segurança.
- Manter o drain agendado enquanto existir execução viva; após expirar a trava, mover apenas a peça órfã para `copy_failed_retryable` e então reivindicá-la pelo pipeline oficial.
- Preservar legenda, roteiro ou direção já confirmados; nunca reiniciar peça concluída, nunca transformar leitura/erro ambíguo em sucesso e nunca reabrir falha permanente automaticamente.
- Rejeitar escritas tardias com identidade da execução/fencing ou comparação equivalente, para um worker antigo não sobrescrever uma retomada mais nova.
- Tratar as três peças já presas somente após auditoria do estado e por ação operacional separada da publicação; não incluir reparo destrutivo ou reprocessamento em massa na migration.

### 3. Contrato do roteirista

- Capturar de logs sanitizados os formatos reais de resposta que produziram `invalid_output`, sem conteúdo pessoal ou segredos.
- Formalizar um contrato de campo único para `script`, compartilhado entre OpenAI, Claude, Gemini e Groq.
- Aceitar apenas três disposições auditáveis: JSON válido, envelope recuperável fiel e texto simples válido; objeto desconhecido, vazio ou ambíguo continua falhando fechado.
- Aplicar pt-BR e validar o idioma antes de persistir.
- Registrar disposição da saída, provedor, modelo, tentativa e causa sanitizada.
- Não repetir erro definitivo com o mesmo payload; fallback de provedor segue apenas as categorias autorizadas.

### 4. Padronização do Copilot

- Extrair a execução para um módulo testável e manter a rota apenas como autenticação, validação de escopo e enfileiramento.
- Aplicar a diretriz canônica de pt-BR e validar título, conteúdo e hashtags antes de marcar sucesso.
- Substituir o fallback atual para texto bruto por contrato estruturado portátil e recuperação explícita, sem falso sucesso.
- Usar a classificação compartilhada de falhas, mensagens curtas em pt-BR, telemetria e limite de tentativas já adotados nas demais rotinas.
- Adicionar lease, heartbeat e claim ao job do Copilot; uma falha anterior à chamada do provedor não consumirá tentativa do provedor.
- Antes de injetar uma peça, revalidar workspace, cliente e pipeline; persistir resultado e efeito de forma idempotente para impedir duplicação em replay.

## Banco, segurança e instalação

- Criar migration forward-only para o escopo do health check e para os ajustes duráveis da fila que exigirem banco.
- Incluir `GRANT` explícito para qualquer objeto novo, manter RLS e acesso administrativo atuais e revogar acesso de `anon`.
- Não armazenar chaves novas nem mover credenciais para tabelas diferentes.
- Atualizar a verificação da instalação para conferir coluna/índice/funções/trigger/cron resultantes; se não houver tabela nova, a checagem 80 permanece sem expansão.
- Preservar endpoints cron protegidos por `CRON_SECRET`.

## Testes obrigatórios

Para cada ocorrência, usar controles fiéis de erro/timeout, ausência ou vazio real e resposta válida:

- **Health check:** duas marcas com chaves diferentes; uma válida e outra 401; provar que somente a conexão correspondente muda.
- **Reaper:** execução viva não é tocada; trava expirada volta à fila; peça concluída não repete; worker tardio não sobrescreve a retomada.
- **Roteirista:** reproduzir exatamente o shape real que falhou, além de JSON válido, envelope recuperável, texto válido, vazio e objeto desconhecido.
- **Copilot:** pt-BR válido, resposta inválida, timeout, replay após commit e falha antes do provedor; provar uma única peça injetada.
- Rodar testes focados, tipos, guardiões de idioma, testes de RLS/ACL afetados, ensaio completo do fluxo e suíte global sem ampliar timeout, pular teste ou mascarar falha.

## Sequência MASTER-first

1. Implementar código e migration no MASTER.
2. Regenerar `007_delta_migrations.sql` com `build_delta.py`.
3. Subir a versão e sincronizar `delta_version.txt`, `MASTER_RELEASE_VERSION` e contratos do control-plane.
4. Atualizar `verify-installation-client.sql` para os novos invariantes.
5. Executar `bun run master:check`, testes focados, suíte global e ensaio de estado equivalente.
6. Apresentar matriz de evidências, versão, SHA, testes, estado das peças e bloqueadores.
7. Publicar o MASTER somente após autorização explícita.
8. Atualizar primeiro uma instalação de teste somente após autorização separada.
9. Auditar diretamente health checks, fila, peças e efeitos no destino.
10. Autorizar separadamente as demais instalações.

## Ação administrativa separada: Groq

Após a instalação de teste estar validada:

- o Owner/Admin autorizado substitui a chave Groq pela tela segura de Conexões;
- executar verificação real da nova chave;
- comprovar health check válido para aquele workspace;
- simular uma falha transitória do principal em ambiente controlado e confirmar o Groq como fallback;
- não publicar, migrar ou copiar a chave entre instalações.

## Critérios de aceite

- Uma chave inválida afeta somente seu workspace.
- Nenhuma peça permanece indefinidamente em produção após perda do worker.
- Peças concluídas não são repetidas e falhas permanentes não são retomadas silenciosamente.
- Roteiro válido é aceito de forma equivalente nos quatro provedores; vazio e resposta ambígua falham fechados.
- Copilot produz pt-BR, não registra texto bruto malformado como sucesso e não duplica peça em replay.
- MASTER, delta, versão, SHA, contrato e verificação de instalação permanecem sincronizados.
- Publicação, atualização da instalação de teste, propagação geral e troca da chave Groq continuam sendo autorizações independentes.
