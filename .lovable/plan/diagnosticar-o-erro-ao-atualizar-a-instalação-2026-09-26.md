# Diagnosticar o erro ao atualizar a instalação

## Objetivo
Identificar a falha exata da tentativa de atualização, sem repetir a operação por conta própria nem alterar dados ou publicar o MASTER.

## Etapas
1. Acompanhar a tentativa autorizada pelo usuário e registrar o horário, a resposta da solicitação, o erro exibido e os registros do servidor.
2. Conferir se uma operação foi criada e em qual etapa parou, distinguindo falha de comunicação com a tela de falha efetiva da atualização.
3. Rastrear a resposta até o ponto responsável no código e apresentar a causa comprovada e uma correção segura antes de executá-la.

## Limites técnicos
A inspeção será somente leitura. A chamada `runAutomatedUpdateFn` é acionada pela tela após a confirmação e já converte erros lançados em `Error`; essa proteção, por si só, não demonstra a causa do novo aviso. Os registros consultados até 18:07 UTC não mostraram uma nova tentativa nem erro Seroval. Atualização de instalação e publicação dependem de autorizações explícitas separadas; qualquer correção seguirá o processo MASTER-first.
