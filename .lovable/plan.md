# Plano de contenção — atualização 1.4.38 da Casa 8

## Diagnóstico confirmado

- A Casa 8 iniciou a atualização de `1.4.37` para `1.4.38` em 25/09/2026 às 01:06 UTC.
- A falha ocorreu na migration 92, no único comando novo, ao chamar `jsonb_object_length(jsonb)`, função que não existe no PostgreSQL usado pelas instalações.
- As migrations 1–91 já estavam confirmadas pelo ledger; a 92 ficou `running`, sem confirmação.
- O comando 92 é um bloco transacional. O erro abortou esse bloco antes de confirmar checkpoint ou alterar `posts.design_brief`.
- A Casa 8 continua registrada em `1.4.37`, com o commit anterior fixado, sem operação ativa, sem deployment novo e com saúde anterior preservada.
- Não houve efeito externo registrado nessa tentativa. As etapas de código, build, validação e versão não começaram.
- O MASTER não revelou o defeito porque tinha zero briefings com o envelope-alvo: o bloco percorreu zero linhas e nunca avaliou a função inválida.
- Clicar novamente agora repetirá a mesma falha. A tentativa atual deve permanecer encerrada como evidência, sem edição manual do histórico.

## Estratégia segura

### 1. Congelar novas atualizações para 1.4.38

- Bloquear temporariamente novas operações que apontem para o pacote defeituoso.
- Mostrar uma mensagem objetiva no gerenciador, sem oferecer repetição enquanto o pacote corrigido não estiver publicado.
- Não cancelar, apagar ou reclassificar a tentativa já encerrada da Casa 8.

### 2. Corrigir sem editar migration histórica

- Preservar integralmente a migration 92 já publicada e seu hash.
- Criar uma migration nova, forward-only e idempotente, contendo uma função de compatibilidade estritamente limitada para contar chaves de um objeto JSONB.
- No executor do MASTER, instalar essa compatibilidade antes de retomar a migration 92 quando detectar exatamente este pacote, arquivo e erro conhecido.
- Depois que a 92 for confirmada, a nova migration remove a compatibilidade temporária, deixando o banco no estado canônico sem função residual.
- Restringir o mecanismo ao fingerprint publicado da 1.4.38; nenhum erro SQL genérico poderá ser ignorado ou transformado em sucesso.
- Não alterar RBAC, RLS, autenticação, dados editoriais válidos ou migrations antigas.

### 3. Tornar a retomada determinística

- A nova tentativa deve referenciar a operação falha e herdar somente os checkpoints confirmados.
- Revalidar no banco da Casa 8 as migrations 1–91 pelo arquivo e fingerprint.
- Retomar na migration 92, nunca reexecutar as anteriores e nunca avançar diretamente para código/deployment.
- Confirmar a 92 no ledger Client e no ledger do Control-plane antes de seguir.
- Se qualquer hash, posição, versão ou estado divergir, bloquear sem escrita adicional.

### 4. Fechar a lacuna de testes

- Executar a migration em PostgreSQL efêmero com três fixtures: zero candidatos, envelope corrigível e conteúdo ambíguo.
- Comprovar que o caso com registro real executa o ramo interno e termina sem função indefinida.
- Executar duas vezes para provar idempotência.
- Testar falha antes do checkpoint, retomada exata na migration 92 e ausência de deployment quando o banco falha.
- Adicionar verificação estática de funções PostgreSQL usadas nas migrations e um ensaio de execução com dados que ativem seus ramos.
- Garantir que nenhum teste seja pulado, nenhum timeout seja ampliado e nenhuma falha seja mascarada.

### 5. Fluxo MASTER-first

1. Aplicar a contenção, a compatibilidade limitada, a migration nova e os testes no MASTER.
2. Regenerar o delta e subir para `1.4.39`.
3. Sincronizar `delta_version.txt`, hash, `MASTER_RELEASE_VERSION` e contrato do Control-plane.
4. Atualizar o verificador de instalação para confirmar a ausência da função temporária e de envelopes corrigíveis.
5. Rodar `bun run master:check`, testes focados, tipos, lint, build e suíte global oficial.
6. Se o ambiente descartável continuar indisponível, não publicar: restaurar primeiro um ambiente de integração válido e executar o ensaio completo.
7. Apresentar as evidências e solicitar autorização explícita para publicar o MASTER.

### 6. Propagação controlada

- Após autorização e publicação, usar a Casa 8 como primeira instalação de validação.
- Criar uma nova tentativa pelo botão de retomada somente depois de o painel indicar a versão corrigida.
- Acompanhar migration 92, migration corretiva, código, deployment, validação e registro da versão.
- Confirmar que o briefing reportado aparece limpo e que nenhum conteúdo ambíguo foi alterado.
- Somente depois da Casa 8 aprovada, liberar atualização das demais instalações uma por vez.

## Critérios de liberação

- Casa 8 permanece operacional em `1.4.37` até a correção publicada.
- Migration histórica e tentativa falha permanecem imutáveis.
- Retomada começa exatamente na migration 92 e não repete trabalho confirmado.
- Nenhuma função temporária sobra no banco.
- Nenhuma instalação recebe código novo antes de concluir o banco.
- MASTER, pacote, versão, verificadores e Control-plane ficam sincronizados.
- Publicação e propagação só ocorrem com autorização explícita.

## Orientação imediata

Não clicar em **Tentar novamente** nem iniciar atualizações em outras instalações enquanto a versão corretiva não estiver publicada e validada.
