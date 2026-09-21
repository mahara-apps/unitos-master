# Correção definitiva do teste de e-mail

## Resultado esperado
- Usar o remetente central da instalação sem criar configuração paralela por workspace.
- Distinguir corretamente “conta Resend em modo de teste” de “domínio realmente não verificado”.
- Confirmar no Resend o estado do domínio `pitada.digital` e os registros DNS exigidos, se houver.
- Executar um envio real de teste somente depois da correção, sem simular sucesso.

## Alterações
1. Corrigir a classificação do erro 403 do Resend para reconhecer primeiro a restrição de `onboarding@resend.dev`.
2. Centralizar a tradução dos erros de envio hoje duplicada nas duas telas de Mensageria.
3. Manter `public.installation.email_from` e `email_from_name` como fonte institucional única; não alterar RBAC, RLS ou a Apex.
4. Se o domínio estiver verificado, registrar `unitos@pitada.digital` como remetente institucional central; se não estiver, não gravar configuração inválida e informar os registros DNS retornados pelo Resend.
5. Aplicar o fluxo MASTER-first: regenerar o pacote, sincronizar versão/SHA e validar com `master:check`.

## Validação
- Teste focado para os dois erros 403 distintos.
- Consulta real ao Resend para domínio e DNS.
- Envio real para um destinatário administrativo autorizado, sem expor endereço ou credencial.
- Typecheck, lint aplicável, build e `bun run master:check`.
- Publicação da correção, conforme solicitado.
