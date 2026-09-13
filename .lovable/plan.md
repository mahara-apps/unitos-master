# Corrigir definitivamente o ciclo de atualização da Taveira

## Causa confirmada

- A operação da Taveira encerrou em `manual_review` às 19:39, na etapa de banco, após atingir `attempt_count = 8`.
- As execuções 6, 7 e 8 estavam saudáveis e avançaram migrations, mas cada novo `claim` incrementou o contador reservado para falhas.
- O caminho de erro também incrementa o mesmo contador no `retry`, podendo cobrar duas vezes pela mesma falha.
- Assim, o limite de segurança mede quantidade de fatias/retomadas, não falhas reais, e interrompe atualizações longas por desenho.

## Correção

1. **Separar execução de falha**
   - `claim` renova lease e fencing sem incrementar o contador de falhas.
   - Somente `retry` incrementa `attempt_count`.
   - Uma fatia concluída com `PENDING` usa `yield` e não consome tentativa.

2. **Fechar tentativas corretamente**
   - Ao executar `yield`, marcar a tentativa atual como concluída por continuação normal.
   - Ao executar `retry`, marcar a tentativa atual com o erro classificado.
   - Evitar tentativas antigas permanentemente em `running`.

3. **Preservar segurança e progresso**
   - Manter lease, fencing, checkpoints, ledger e RBAC/RLS atuais.
   - Esgotar o limite apenas após falhas transitórias reais consecutivas.
   - Zerar a sequência de falhas após uma fatia que persistiu progresso com sucesso.

4. **Cobrir regressões**
   - Atualização com mais de oito fatias deve concluir sem revisão manual.
   - `yield` não altera o contador de falhas.
   - Um erro incrementa uma única vez; sucesso posterior reinicia a sequência.
   - Lease perdido continua impedindo gravações antigas.

5. **Fechar MASTER-first**
   - Aplicar migration corretiva no MASTER.
   - Regenerar o delta, sincronizar SHA e versão em 1.3.88 e rodar `master:check` e testes direcionados.
   - Publicar somente com autorização explícita.
   - Depois da publicação, iniciar uma nova atualização da Taveira e acompanhar até a validação final; não reabrir a operação 1.3.86 encerrada.

## Resultado esperado

Atualizações longas podem usar quantas fatias forem necessárias. Apenas falhas reais consomem tentativas, sem novo ciclo artificial em revisão manual.
