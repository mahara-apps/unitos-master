# Corrigir a atualização da Taveira

## Diagnóstico confirmado

- A tentativa iniciada às 18:40 foi encerrada às 19:03 como **falha**, sem operação ativa; a Taveira continua na versão 1.3.68.
- A falha ocorreu na migration `20260913180605_027de2ce-ec11-41ae-8c46-5deda7334fff.sql`, ao criar o índice `installation_operations_resume_idx`.
- O executor adiou esse `CREATE INDEX` como dependência ausente e, ao final do arquivo, não conseguiu resolvê-lo.
- A consulta direta ao banco da Taveira foi recusada pelo token disponível. Portanto, a coluna exata ou condição que provocou o adiamento ainda precisa ser capturada pelo próprio executor antes de afirmar a causa SQL final.

## Plano de correção

1. **Tornar o erro diagnosticável**
   - Registrar, para cada comando adiado, SQLSTATE, mensagem original e objeto dependente.
   - Exibir esse detalhe na execução em vez da mensagem genérica de “dependência não resolvida”.

2. **Corrigir a aplicação de dependências dentro da migration**
   - Reexecutar os comandos adiados após cada lote que possa criar suas dependências, não somente no encerramento do arquivo.
   - Preservar a fila e o checkpoint entre retomadas, removendo apenas comandos realmente concluídos ou duplicados.
   - Impedir que um comando seja marcado como processado quando sua dependência ainda não foi materializada.

3. **Blindar a migration de operações**
   - Adicionar uma migration corretiva idempotente que garanta primeiro as colunas necessárias e só depois recrie o índice.
   - Não depender de reinício manual, exclusão de dados ou alteração de RBAC/RLS.
   - Manter migrations já publicadas rastreáveis, usando uma nova migration em vez de ocultar a correção.

4. **Cobrir regressões**
   - Testar dependência criada no mesmo arquivo, retomada no último comando, fila preservada entre invocações e erro final com SQLSTATE real.
   - Testar especificamente a sequência `ALTER TABLE` → `DROP INDEX` → `CREATE INDEX` da Taveira.
   - Confirmar que migrations concluídas continuam registradas uma única vez e que o percentual não regride.

5. **Fechar o ciclo MASTER-first**
   - Atualizar o MASTER para 1.3.83, regenerar o delta e sincronizar SHA/versão.
   - Atualizar a verificação da instalação apenas se surgir nova estrutura permanente.
   - Rodar `master:check`, testes de instalação, tipos, compilação e validação do pacote.

6. **Recuperar a Taveira com segurança**
   - Após a correção estar publicada no MASTER, iniciar uma nova tentativa retomável.
   - Acompanhar banco, publicação e validação final até a Taveira registrar 1.3.83.
   - Não publicar nem iniciar a nova tentativa sem autorização explícita.

## Resultado esperado

A atualização deixa de falhar com uma dependência opaca, retoma com segurança e informa a causa SQL completa caso exista outro bloqueio real.
