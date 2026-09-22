# Correção definitiva do Resend por instalação

## Relatório da auditoria somente leitura

### Causa confirmada
- A tela salva a chave cifrada em `brand_api_credentials` e salva o remetente digitado apenas em `metadata.handle`; também marca `brand_connections.channels.resend.connected = true`.
- O indicador “Conectado/Gerenciar” e todos os envios usam outro caminho: `resolveResendConfig` ignora `metadata.handle` e exige `public.installation.email_from`.
- Não existe hoje uma tela ou função que grave o remetente informado pelo diálogo do Resend em `public.installation.email_from`/`email_from_name`.
- Resultado: a gravação pode concluir com sucesso, mas imediatamente depois o mesmo sistema considera o canal “não configurado” e bloqueia o envio com `remetente_instalacao_nao_configurado`.

### Evidência no MASTER
- Existe uma credencial Resend cifrada, um remetente em `metadata.handle` e o espelho do canal marcado como conectado.
- O singleton `public.installation` existe, porém `email_from` e `email_from_name` estão vazios.
- Portanto, no estado atual do MASTER, o botão permanecer como “Configurar” mesmo após salvar é o comportamento produzido por essa divergência.
- O último envio Resend registrado como aceito no banco consultado é de 28/08/2026; não há evidência recente suficiente para afirmar que os disparos atuais estejam funcionando.

### Alcance conhecido
- O contrato defeituoso está no código e no pacote MASTER atual, portanto pode atingir qualquer instalação que receba essa versão.
- O painel registra Apex e Taveira em 1.4.30, `unitos-new-teste-02` em 1.4.28, Casa 8 ainda em provisionamento e `unitos-teste` com acesso ao banco indisponível.
- Esta auditoria não alterou nem testou envios nas instalações. A configuração interna de cada banco ainda precisa ser inspecionada individualmente antes de classificar cada ambiente como pronto, incompleto, chave inválida ou domínio não verificado.

## Comportamento definitivo

Cada instalação terá exatamente uma configuração Resend própria:

- chave de API própria, cifrada e nunca exposta ao navegador ou aos logs;
- nome e endereço do remetente próprios;
- domínio do remetente validado na mesma conta Resend da chave;
- estado único compartilhado pela tela, teste e envios automáticos.

O estado exibido será explícito:

1. **Não configurado** — falta chave ou remetente.
2. **Salvo, domínio pendente** — configuração persistida, mas o domínio ainda não está verificado no Resend.
3. **Pronto para envio** — chave válida, domínio verificado e teste controlado aceito.
4. **Ação necessária** — chave recusada, credencial ilegível ou permissão insuficiente.

O botão passará a refletir a persistência real: configuração salva aparece como **Gerenciar**, mesmo quando ainda existe uma pendência de domínio; “Conectado/Pronto” ficará reservado ao conjunto realmente apto a enviar.

## Implementação proposta

1. **Fonte única por instalação**
   - Manter remetente e nome em `public.installation`, conforme a regra institucional já adotada.
   - Criar armazenamento cifrado de credencial no escopo da instalação, sem depender de `brand_id` e sem guardar a chave em texto aberto.
   - Restringir leitura e alteração ao servidor e à autoridade administrativa correta, preservando RBAC/RLS/auth.

2. **Salvar tudo de forma coerente**
   - O diálogo do Resend salvará chave, nome e endereço do remetente como uma única configuração.
   - Validar formato, autenticação da chave e domínio correspondente antes de declarar o canal pronto.
   - Uma falha parcial não poderá deixar a tela marcada como conectada com uma configuração incompleta.

3. **Um único resolvedor**
   - Tela, teste manual, convites, notificações e templates usarão exatamente a mesma configuração por instalação.
   - Remover a decisão operacional baseada no espelho legado de `brand_connections.channels.resend`.
   - Não usar silenciosamente credenciais de outro workspace ou de outra instalação.

4. **Migração segura do legado**
   - Migrar automaticamente somente quando houver uma única credencial Resend inequívoca na instalação e um remetente válido associado.
   - Em caso de múltiplas credenciais, ausência de remetente ou chave ilegível, não escolher silenciosamente: marcar como ação necessária.
   - Preservar os registros antigos até a validação final; nenhuma chave será exibida ou copiada para logs.

5. **Validação real por ambiente**
   - Consultar cada instalação acessível em modo leitura e classificar chave, remetente, domínio e último resultado conhecido.
   - Confirmar a chave diretamente no Resend e verificar o estado do domínio correspondente.
   - Após a correção, realizar um envio controlado para um destinatário administrativo autorizado em cada instalação e confirmar tanto a aceitação do Resend quanto o registro local.
   - Não disparar mensagens para usuários reais durante a validação.

6. **Proteção contra regressão**
   - Cobrir: salvar e reabrir; botão Gerenciar após salvar; domínio pendente; chave inválida; chave ilegível; isolamento entre instalações; teste real e todos os produtores de e-mail.
   - Garantir que “Pronto” implique que o mesmo resolvedor usado pelos disparos consegue montar uma configuração válida.
   - Adicionar a checagem da configuração por instalação aos verificadores de instalação.

7. **Entrega MASTER-first**
   - Aplicar schema, código e testes primeiro no MASTER.
   - Regenerar o delta, sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION`, atualizar os verificadores e executar `bun run master:check` mais os testes focados.
   - Reportar o resultado antes de publicar.
   - Publicar e propagar somente após autorização explícita; depois validar cada instalação separadamente.

## Critérios de aceite

- Salvar a configuração muda o botão para **Gerenciar** após recarregar a página.
- O remetente mostrado é exatamente o usado no envio.
- Cada instalação usa somente sua própria chave, remetente e domínio.
- Chave válida com domínio pendente não aparece como “não configurada”, mas também não aparece como pronta.
- Um teste real por instalação é aceito pelo Resend e registrado localmente, sem exposição de chave ou destinatário.
- RBAC, RLS, autenticação, isolamento entre instalações e fluxos não relacionados permanecem inalterados.
