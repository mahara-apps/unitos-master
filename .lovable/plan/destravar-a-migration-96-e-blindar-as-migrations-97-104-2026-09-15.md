# Destravar a migration 96 e blindar as migrations 97–104

## Diagnóstico confirmado

- A migration 96 (`20260913183337_...sql`) contém somente `DROP FUNCTION public.heartbeat_installation_operation(uuid, text, integer);`, sem `IF EXISTS`. Na Taveira essa assinatura legada já não existe; portanto o estado desejado já está satisfeito, mas o comando falha em vez de ser reconhecido como idempotente.
- As migrations 97–100 são majoritariamente aditivas ou usam `CREATE OR REPLACE`/`IF EXISTS`, mas incluem funções operacionais e reagendamento de cron que exigem validação de efeitos e permissões reais.
- As migrations 101–102 contêm `ALTER DEFAULT PRIVILEGES` em múltiplas linhas. O saneamento atual remove apenas comandos privilegiados de uma linha, embora o próprio código documente que a API de gestão não pode executar `ALTER DEFAULT PRIVILEGES`; elas são bloqueios futuros concretos.
- A migration 103 é uma verificação de segurança e deve continuar falhando fechada se ainda houver privilégios anônimos perigosos.
- A migration 104 cria/reconcilia tentativas, constraints e funções operacionais. `CREATE TABLE IF NOT EXISTS` sozinho não prova que uma tabela preexistente possui todas as colunas e constraints esperadas.

## Correção proposta

1. **Manter a Taveira pausada**
   - Não reabrir a operação, não consumir tentativa e não alterar o pacote fixado enquanto a correção é preparada e ensaiada.

2. **Tratar a migration 96 por pós-condição exata**
   - Não reescrever silenciosamente o histórico nem ignorar genericamente `undefined_function`.
   - No executor, reconhecer apenas `DROP FUNCTION` de assinatura explícita quando a resposta real comprovar que exatamente essa assinatura já está ausente.
   - Registrar o statement e a migration 96 como concluídos no checkpoint canônico, sob lease/fencing, somente depois dessa comprovação.
   - Qualquer erro diferente, assinatura ambígua ou resposta vazia continua pausando a operação.

3. **Corrigir o saneamento das migrations 101–102**
   - Fazer o saneamento operar sobre statements SQL completos, incluindo comandos multilinha, em vez de linhas isoladas.
   - Remover apenas os padrões privilegiados explicitamente autorizados; registrar o que foi removido e preservar todo o restante literal.
   - Confirmar depois que os privilégios perigosos estão ausentes e que o `SELECT` público intencional em `installation` permanece.

4. **Pré-validar individualmente as migrations 97–104**
   - 97: confirmar colunas e índice de retomada.
   - 98: confirmar assinatura, proprietário e ACL da função CAS de secrets.
   - 99–100: confirmar funções, grants somente ao `service_role`, fechamento de attempts e existência de um único cron correto, sem duplicar fila ou jobs.
   - 101–103: validar contenção completa de `MAINTAIN`, `TRUNCATE`, `TRIGGER` e `REFERENCES` para `anon`, inclusive o resultado real da verificação.
   - 104: validar tabela, colunas, FK, uniques, RLS, policy, índice, funções e ACLs; detectar divergência estrutural em vez de aceitá-la por `IF NOT EXISTS`.

5. **Ensaiar contra estado equivalente ao real**
   - Reproduzir a Taveira parada em 95/104, com a assinatura antiga ausente.
   - Executar 96→104 integralmente com respostas reais do PostgreSQL/API.
   - Cobrir três controles por leitura: erro/timeout, vazio real e resposta válida.
   - Repetir o ensaio para comprovar idempotência, sem duplicar cron, outbox, attempts, constraints, policies ou funções.
   - Auditar diretamente os dados e catálogos antes/depois.

6. **Fechar MASTER-first**
   - Aplicar a correção forward-only no MASTER.
   - Regenerar o delta, avançar e sincronizar versão/SHA, atualizar a verificação e os testes de completude.
   - Rodar testes direcionados, ensaio real, tipos, build e `bun run master:check`.
   - Apresentar a matriz 96–104 e as evidências antes de solicitar autorização para publicar.

7. **Retomada controlada da Taveira**
   - Publicação e retomada serão autorizações separadas.
   - Após autorização, retomar a mesma operação e o mesmo pacote fixado a partir de 96/104.
   - Acompanhar migration por migration até 104/104 e até Banco e Schema passarem na validação final.
   - Ao primeiro sintoma novo, pausar imediatamente, sem nova tentativa automática.

## Resultado esperado

A migration 96 avança porque sua pós-condição já está comprovadamente satisfeita, e as migrations 97–104 chegam pré-validadas e ensaiadas. A retomada permanece monotônica, auditável e sem correções paliativas ou repetição de tentativa em produção.
