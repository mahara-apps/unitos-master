# Links de redefinição de senha sempre com o endereço da própria instalação

## Causa
O sistema já pede ao serviço de login que o link volte para o endereço certo (`https://<instalação>/reset-password`). Porém, quando esse endereço não está na lista de endereços autorizados do projeto Supabase daquela instalação, o serviço ignora o pedido e usa o "endereço principal" configurado lá, que ficou como `http://localhost:3000` (padrão de projeto novo). Os registros de login confirmam essa origem `localhost:3000`.

Hoje a instalação/atualização ajusta só a confirmação de e-mail; nunca grava o endereço principal nem a lista de autorizados. Por isso, cada instalação nova nasce com o problema.

## Correção definitiva
1. **Gravar automaticamente o endereço da instalação** no serviço de login durante instalação e toda atualização: endereço principal = domínio da instalação; autorizados = domínio + `/reset-password`, `/login`, `/invite/**` e domínios extras cadastrados (ex.: preview). Mesclar com os autorizados já existentes, sem apagar nada.
2. **Fonte do domínio**: o cadastro da instalação (`public.installation` / registro no painel de Instalações). Se faltar, a etapa avisa e não grava `localhost`; nunca usar valor de outra instalação.
3. **Conferência no "Validar"**: ler a configuração de login e reprovar se o endereço principal for `localhost`/vazio/diferente do domínio, ou se `/reset-password` não estiver autorizado. Mensagem em português com ação "Corrigir endereços de login".
4. **Botão "Corrigir endereços de login"** no painel de Instalações (Super Admin), para consertar Casa 8, Apex e as demais já existentes sem esperar nova versão.
5. **Reforço no app**: reenvio de acesso pela Equipe já usa o endereço da instalação; manter, e cobrir com teste que nunca sai `localhost`.

## Testes
- Montagem da configuração: domínio vira endereço principal; lista inclui `/reset-password`; mantém autorizados existentes; recusa `localhost`/domínio vazio.
- Conferência reprova `localhost:3000` e aprova domínio correto.

## Entrega
MASTER-first: versão 1.4.73, `master:check`, sem publicar. Depois, com sua autorização: publicar e clicar "Corrigir endereços de login" em cada instalação (ou atualizar). O usuário afetado deve pedir um novo e-mail, pois o link antigo continua apontando para `localhost`.

## Detalhes técnicos
- `src/lib/installation/automation.server.ts`: `applyInstallationAuthDefaults` passa a enviar `site_url` e `uri_allow_list` (mesclado após `GET /config/auth`) via `configureAuth`; nova `verifyInstallationAuthUrls`.
- Nova server fn Super Admin para reaplicar só essa etapa; botão no painel de instalações.
- Sem migração de banco.
