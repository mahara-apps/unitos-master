# Revisão do gate global de backup — Master 1.4.18

## Objetivo

Permitir operações controladas no Control-plane e na Apex existentes sem tornar a existência de backup restaurável um pré-requisito bloqueante. A ausência de backup exigirá aceitação global de risco específica, explícita e auditável; não será tratada como instalação descartável.

## Alteração proposta

1. Substituir o caminho de exceção descartável por dois caminhos globais válidos:
   - backup restaurável comprovado; ou
   - aceitação consciente da ausência de backup para o Control-plane exato, com confirmação literal, operador, justificativa específica e arquivo de auditoria persistente.
2. Vincular a aceitação sem backup ao project ref canônico `tkjbhttylouamqxnbfgv`; rejeitar curingas, escopo de instalação, identificador divergente, justificativa curta e parâmetros extras.
3. Registrar em JSONL somente evidência operacional não secreta, incluindo decisão, projeto, operador, justificativa, escopo e horário UTC.
4. Manter o gate antes de qualquer consulta preparatória ou escrita nos executores de promoção/recovery e freeze.
5. Preservar autorizações próprias de cada ação, identidade da conexão, hashes, preflights, transação única, advisory locks, freeze, fencing, ledger e validações finais.
6. Não alterar SQL, dados, operação Apex, cron ou qualquer ambiente remoto.

## Testes

- Backup comprovado continua aceito e auditado.
- Ausência de backup sem aceitação explícita continua bloqueada.
- Aceitação global válida libera somente o gate de risco, sem substituir a autorização específica da operação.
- Project ref ausente/divergente, operador ausente, justificativa insuficiente, escopo de instalação e formato antigo de exceção são bloqueados.
- Freeze/recovery/executor continuam exigindo suas confirmações, preflights, fencing e verificações próprias.
- Executar testes focados, `master:check`, typecheck, lint dos arquivos alterados e build.

## Critério final

**PASS** somente se o diff local demonstrar que a ausência de backup deixa de ser bloqueante exclusivamente mediante aceitação global auditável, sem enfraquecer nenhuma proteção operacional independente. Nenhuma ação remota será executada.
