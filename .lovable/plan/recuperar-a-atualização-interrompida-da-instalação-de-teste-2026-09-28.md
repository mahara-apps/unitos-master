# Recuperar a atualização interrompida da instalação de teste

## Diagnóstico confirmado

- A tentativa da **unitos-new-teste-02** falhou na validação final: duas tabelas ainda concedem privilégios perigosos ao acesso anônimo. As 117 migrações daquela tentativa constam como concluídas; a publicação do código também consta como concluída, mas a versão **não** foi registrada como instalada.
- O botão **Retomar atualização** envia o identificador da tentativa falha para um comando do banco que permite herdar checkpoints **somente de provisionamento**, não de atualização. Por isso aparece “Retry terminal é permitido somente para provision”. Nenhuma nova operação foi aberta pela tentativa rejeitada; não há operação ou item de fila ativo registrado para essa instalação.
- O pacote MASTER **1.4.54** já contém a revogação dos privilégios que causaram a primeira falha, mas sua publicação na instalação não foi confirmada. A tentativa falha usou o pacote **1.4.53**. Misturar seus checkpoints com um pacote diferente não é uma retomada segura.

## Correção proposta

1. **Conter e auditar sem escrever:** manter a instalação afetada sem novas execuções; conferir o histórico, a versão efetivamente publicada, o pacote disponível, o ledger de migrações e os privilégios atuais diretamente no destino. Se a leitura direta do destino não estiver disponível, registrar essa auditoria como bloqueada — não inferir integridade apenas pelo painel do MASTER.
2. **Corrigir o fluxo no MASTER:** trocar a ação enganosa de “retomar” por **autorizar nova atualização** após o MASTER corrigido estar publicado. Não enviar o ID da atualização falha ao mecanismo de retry reservado ao provisionamento; rejeitar esse ID também no servidor. Preservar a tentativa antiga e seus checkpoints para auditoria. A nova operação deverá usar o pacote publicado e reconciliar migrações já concluídas contra o ledger do destino, sem reaplicar efeitos.
3. **Proteger casos relacionados:** verificar outros botões e chamadas que enviem retry de atualização; tratar leitura com erro, ausência real e resposta válida de modo distinto. Não reiniciar do zero quando o ledger estiver indisponível, incompleto ou divergente. Não alterar a política de retry do provisionamento.
4. **Testar antes da liberação:** reproduzir o erro exato; testar falha/timeout, ausência real e resposta válida usando formatos reais das leituras críticas; ensaiar a instalação de teste com estado equivalente (117 migrações concluídas, etapas 1–3 concluídas, validação falha), incluindo perda de resposta, crash após confirmação e replay. Confirmar que nenhuma migração concluída se repete e que a validação e o registro de versão terminam corretamente. Conferir efeitos diretamente no destino quando houver acesso.

## Sequência de entrega

- Aplicar a correção **primeiro no MASTER**, atualizar a verificação de instalação se necessário, regenerar o delta, alinhar SHA e versão anunciada e executar testes focados, suíte global sem relaxamentos e `bun run master:check`.
- Apresentar evidências, pendências e estado da instalação. **Pedir autorização explícita para publicar o MASTER**; somente depois, **pedir autorização separada para iniciar uma nova atualização na instalação de teste**. Não publicar nem executar a instalação nesta etapa.
- Após a execução autorizada, comprovar validação final, versão realmente registrada e ausência de efeitos duplicados antes de sugerir as demais instalações.
