# Hotfix 1.3.92 — destravar checkpoint da Taveira

## Diagnóstico confirmado
- O número `25/34` é o índice de retomada, não uma falha da policy SQL.
- A preparação consulta o marcador interno junto com vários comandos de estrutura. Quando a Management API não devolve a linha do `SELECT`, o código interpreta isso como marcador ausente, volta silenciosamente ao comando zero e reaplica os mesmos 25 comandos.
- A fatia termina como concluída, o contador fica em 0/8 e o checkpoint monotônico permanece em 25; por isso o loop parece saudável.

## Implementação
1. Separar a leitura do marcador interno em uma consulta própria e exigir resposta explícita.
2. Nunca reiniciar do zero por resposta vazia; classificar como falha transitória, preservando checkpoint, ledger, lease e fencing.
3. Corrigir o marcador `DONE = -1` para não ser bloqueado pela regra monotônica usada para percentuais.
4. Adicionar testes comportamentais que reproduzam exatamente o loop 25/34 e comprovem avanço até o ledger.
5. Executar o fluxo MASTER-first completo na versão 1.3.92: migration se necessária, delta, SHA/versão, verificação, testes direcionados e `master:check`.
6. Publicar o MASTER e acompanhar a Taveira até sair de Banco/Schema, sem reprocessar migrations registradas.

## Critérios de liberação
- Nenhuma resposta vazia reinicia uma migration no comando zero.
- A migration atual avança de 25/34 e recebe registro no ledger.
- Falhas de leitura são reagendadas sem consumir tentativa.
- Banco e Schema concluem a validação final sem regressão de progresso.
