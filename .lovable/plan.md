# MASTER 1.3.95 — confirmação transacional de migrations

## Objetivo
Eliminar definitivamente a regressão 88→86. A Taveira permanece congelada até nova autorização explícita.

## Implementação
1. Criar no MASTER um registro canônico por `operação + migration + fingerprint`, com estado, comando confirmado, total e timestamps.
2. Criar uma única função transacional protegida por lease/fencing para confirmar comando, concluir migration e atualizar o progresso monotônico da operação.
3. Fazer o executor ler somente esse registro canônico; o ledger do destino vira evidência de aplicação, não contador visual concorrente.
4. Reconciliar a operação atual da Taveira a partir do ledger e checkpoints reais, preservando o maior progresso comprovado e sem reaplicar migrations concluídas.
5. Fechar qualquer divergência ou leitura parcial como pausa auditável, nunca como redução de progresso.
6. Testar timeout pós-commit, replay, resposta parcial, concorrência, fencing inválido e o ensaio fiel 88→104.
7. Cumprir MASTER-first: migration, delta, versão/SHA, verificador, testes e `master:check`.

## Liberação
- Apresentar inventário e evidências antes de publicar.
- Publicação e retomada da Taveira exigem nova autorização explícita.
- Banco e Schema devem chegar à validação final sem regressão ou reprocessamento.
