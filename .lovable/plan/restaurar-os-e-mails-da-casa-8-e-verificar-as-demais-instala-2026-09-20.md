# Restaurar os e-mails da Casa 8 e verificar as demais instalações

## Diagnóstico já confirmado

- A Casa 8 possui credencial Resend própria no workspace e usa o remetente `contato@casa8agencia.com`.
- As quatro tentativas registradas foram recusadas: duas por ausência de configuração, uma por credencial inválida e a mais recente, em **19/09/2026 09:41 BRT**, por **domínio do remetente não verificado**.
- A publicação da Casa 8 não possui `RESEND_API_KEY`, `INVITE_FROM_EMAIL` nem `LOVABLE_API_KEY`; portanto, ela depende corretamente da credencial própria do workspace. O bloqueio atual é a autorização do domínio no Resend, não ausência de envio no código.
- Não há eventos no histórico de Lovable Emails deste projeto nos últimos 14 dias; o fluxo atual das instalações usa Resend.
- Estado das demais instalações:
  - **Apex:** banco acessível, sem workspace cadastrado e sem histórico de e-mail.
  - **unitos-new-teste-02:** workspace sem credencial Resend e sem histórico de e-mail.
  - **unitos-taveira:** publicação sem variáveis de e-mail; a credencial de gestão atual não permite consultar o banco.
  - **unitos-new-teste:** o projeto cadastrado não é acessível com a credencial atual.
  - **unitos-teste:** sem credencial de gestão e compartilha o mesmo projeto cadastrado de `unitos-new-teste`, o que exige validação de identidade antes de qualquer conclusão.

## Execução proposta

1. **Casa 8**
   - Confirmar no Resend se `casa8agencia.com` está verificado para a conta correspondente à credencial mascarada já cadastrada.
   - Se não estiver, orientar a validação DNS ou trocar o remetente por um domínio já verificado da mesma conta.
   - Depois da regularização, executar um único envio controlado e confirmar tanto a resposta do Resend quanto o registro em `message_logs`.

2. **Todas as demais instalações**
   - Completar a inspeção somente leitura de identidade, workspace, credencial Resend, remetente, templates e falhas recentes.
   - Corrigir primeiro os acessos de gestão que hoje impedem a leitura de três ambientes; não assumir que ausência de log significa ausência de problema.
   - Classificar cada instalação como: pronta, não configurada, credencial inválida, domínio não verificado ou inspeção bloqueada.

3. **Proteção do produto**
   - Preservar RBAC/RLS e o isolamento entre instalações e workspaces.
   - Manter todas as operações de escrita fail-closed; a leitura de diagnóstico não altera configurações.
   - Não trocar remetente, chave ou domínio silenciosamente e não disparar e-mails sem destinatário de teste autorizado.

4. **Se houver correção de código necessária**
   - Alterar somente o MASTER e adicionar testes para o erro encontrado.
   - Cumprir o fluxo MASTER-first completo, mantendo o pacote Client e as verificações sincronizados.
   - Não publicar nem propagar para instalações sem autorização explícita separada.

## Evidência final

Entregar uma tabela por instalação com configuração efetiva, remetente, origem da credencial, último resultado conhecido, bloqueio e ação necessária. Para a Casa 8, o aceite será um envio controlado aceito pelo provedor e registrado como enviado.

## Fora de escopo sem nova autorização

- Disparos para usuários reais.
- Alteração de DNS, domínio, credenciais ou remetentes.
- UPDATE/NEW/retry de instalações, recovery, freeze, reativação do cron 37, deploy ou publicação.
