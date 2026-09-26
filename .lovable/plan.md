# Sincronizar a URL oficial e o callback Meta da NXT

## Resultado esperado
- Usar **https://unitosnxt.vercel.app** (sem hífen) como endereço oficial da NXT, conforme sua escolha. O retorno Meta esperado é **https://unitosnxt.vercel.app/api/public/meta/callback**.
- Alterar o endereço no painel deve deixar claro se só o cadastro mudou ou se a configuração da instalação também foi sincronizada. Não anunciar “configurado” enquanto houver divergência.
- Preservar usuários, dados, credenciais, versão instalada e demais instalações; não reprovisionar nem iniciar atualização geral para trocar a URL.

## Diagnóstico confirmado e verificação inicial
- O registro atual da NXT no MASTER está em `unitosnxt.vercel.app`, versão registrada 1.4.42, sem operação ativa. Ambos os endereços com e sem hífen responderam à tela de login na consulta HTTP; isso **não prova** qual deployment, sessão, banco ou callback cada um usa.
- A edição do endereço no painel modifica `installations.domain`; não modifica `PUBLIC_APP_URL`, `VITE_PUBLIC_APP_URL`, `META_REDIRECT_URI` nem `installation.app_url` da NXT. A inspeção compara o cadastro com o valor do retorno Meta no deploy, portanto acusa divergência; ela também mantém o resultado anterior na tela após uma edição, até nova conferência.
- Antes de escrever, conferir em leitura os domínios/deployments da NXT, as três URLs configuradas no deploy, a URL interna da instalação e os destinos de login, cron e Meta. Se o acesso ao destino não estiver disponível, explicitar o bloqueio em vez de presumir que trocar uma variável é seguro.

## Correção mínima no MASTER e na NXT
1. Fazer a troca controlada de endereço com validação prévia e confirmação: identificar o projeto de deploy correto, conferir que `unitosnxt.vercel.app` serve a NXT, registrar o estado anterior e impedir operações concorrentes. Atualizar somente as URLs públicas correspondentes à própria NXT e seu retorno Meta, sem tocar segredos existentes nem relançar migrations. Configurar o domínio no projeto certo e confirmar a disponibilidade antes de promovê-lo como endereço operacional.
2. Tratar explicitamente a sincronização entre cadastro do MASTER, ambiente de deploy, `installation.app_url` e URLs dos cron jobs do destino. Validar o retorno Meta exato no App Meta (ou indicar claramente a etapa manual caso não haja acesso); nunca concluir a troca com valores mistos. Manter uma forma segura de restaurar as URLs anteriores caso a validação falhe, sem reverter dados de negócio.
3. Corrigir a apresentação: ao salvar uma URL no cadastro, descartar a inspeção antiga e exigir nova leitura; mostrar separadamente endereço cadastrado, endereço efetivo do deploy e retorno Meta efetivo/esperado, inclusive falhas de acesso. Não usar uma consulta que atribua domínio durante uma inspeção anunciada como somente leitura.
4. Cobrir com testes a divergência, URL temporária, domínio novo, falha parcial, repetição e ausência de acesso; verificar login, links, callback e saúde sem depender apenas do status “200”. Preservar RBAC/RLS/auth.

## Distribuição e autorizações
- Empacotar a correção de código pelo fluxo **MASTER-first**: regenerar delta, sincronizar versão e hash, conferir verificação da instalação, executar `bun run master:check` e suíte global sem relaxar testes. Não criar tabelas, campos ou rotas sem necessidade demonstrada.
- A correção dos valores operacionais da NXT requer validação e autorização explícitas antes de gravar no deploy ou banco de destino. Publicação do MASTER e propagação para as demais instalações exigem autorizações separadas; este plano não executa nenhuma delas.