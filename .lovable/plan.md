# Corrigir a falha de segurança na atualização das instalações

## O que foi constatado

- A atualização exibida concluiu banco e publicação do aplicativo, mas parou na validação final; o registro da versão ficou pendente. Não há evidência de que retomar agora seja seguro.
- A verificação 83 rejeita privilégios `REFERENCES`, `TRIGGER`, `TRUNCATE` e `MAINTAIN` para o papel anônimo em qualquer tabela pública. Na captura, as tabelas de controle da duplicação e da criação por modelo aparecem com os três primeiros privilégios.
- As migrations que criam essas tabelas concedem acesso explícito apenas a usuários autenticados e ao serviço, mas não revogam os privilégios herdados por `anon`. Uma migration anterior tenta endurecer privilégios padrão, porém o executor da atualização remove comandos `ALTER DEFAULT PRIVILEGES` antes de aplicar as migrations. Isso explica por que o pacote não impede herança em novos objetos; a origem exata das ACLs da instalação precisa ser confirmada por leitura no destino.
- A consulta ao MASTER neste turno não mostrou esses privilégios anônimos; portanto, validar só o MASTER não reproduz a falha nas instalações.

## Plano de contenção e diagnóstico

1. Não clicar em **Retomar atualização** e não iniciar outras atualizações. Levantar em leitura o estado da operação afetada e das demais instalações: etapa, checkpoints, ledger, versão efetivamente registrada e jobs/retomadas ativos. Preservar integralmente o histórico.
2. Consultar somente em leitura no banco da instalação afetada as ACLs efetivas das duas tabelas, proprietário, privilégios padrão do proprietário e grants herdados; confirmar quais instalações apresentam a mesma condição. Verificar a identidade do executor e o SQL realmente aplicado nos dois pontos de criação.
3. Auditar no pacote inteiro as demais tabelas criadas após o endurecimento e classificar cada ocorrência como segura ou vulnerável; registrar escopo e evidências antes de modificar qualquer instalação.

## Correção proposta no MASTER

1. Acrescentar migration mínima, idempotente e específica, revogando `REFERENCES`, `TRIGGER`, `TRUNCATE` e `MAINTAIN` de `anon` nas duas tabelas afetadas. Se a varredura identificar outras tabelas afetadas, incluí-las explicitamente após conferir os acessos públicos legítimos. Não mudar RLS, dados, funções de negócio, permissões autenticadas nem o critério da verificação 83.
2. Impedir recorrência: adicionar teste de execução com privilégios padrão permissivos em ambiente descartável, assegurando que toda tabela nova fique sem esses privilégios efetivos mesmo quando comandos de default privileges forem removidos pelo executor. Corrigir a geração/aplicação do pacote apenas se essa reprodução comprovar necessidade; não assumir que um teste estático prova o estado final.
3. Atualizar a verificação de instalação para cobrir os objetos corrigidos mantendo a verificação global 83; regenerar o delta, alinhar SHA e versão anunciada do MASTER e rodar testes focados, suíte global sem relaxamentos e `bun run master:check`.
4. Ensaiar a atualização completa com estado equivalente ao destino, incluindo falha na validação final, retomada, perda de resposta e replay. Demonstrar que migrations concluídas não são reaplicadas e que a versão só é registrada após todas as verificações passarem.

## Liberação controlada

- Apresentar inventário, resultados dos testes e leitura sanitizada das ACLs; solicitar autorização explícita **separada** para publicar o MASTER.
- Após publicação, solicitar autorização explícita **separada** para retomar primeiro a instalação afetada. Confirmar leitura de ACLs, validação final, versão efetiva e ausência de trabalho duplicado; só então planejar as demais, uma por vez.
- A reorganização visual de **Novo modelo** permanece fora desta correção de segurança e usará apenas o design system atual do Unitos, em plano separado.

## Detalhes técnicos

As tabelas afetadas são `public.project_duplication_requests` e `public.project_template_requests`. A verificação é o item 83 de `verify-installation-client.sql`; `sanitizeBaselineSqlForManagementApi` remove `ALTER DEFAULT PRIVILEGES` da execução via Management API. Uma revogação explícita por tabela preserva os grants de `authenticated` e `service_role` e não altera linhas nem checkpoints existentes. Nenhuma escrita no destino será feita como parte da auditoria.
