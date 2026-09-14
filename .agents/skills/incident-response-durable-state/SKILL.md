---
name: Resposta a incidentes de estado durável
description: Playbook obrigatório para incidentes em que erros, respostas vazias, retomadas ou checkpoints podem causar falso estado, repetição ou corrupção.
---

# Resposta a incidentes de estado durável

Use este playbook em incidentes de instalação, atualização, importação, fila, worker, cron ou integração quando houver travamento, repetição, regressão de progresso, falso cancelamento, falso sucesso ou suspeita de duplicação/corrupção.

## Princípio central

Uma leitura tem pelo menos três resultados semanticamente distintos:

1. erro ou indisponibilidade;
2. sucesso com ausência real;
3. sucesso com dado válido.

Nunca converta erro, timeout, HTTP 5xx, HTTP 429, conexão interrompida, resposta ilegível, resposta vazia inesperada ou `data=null + error` em ausência, cancelamento, sucesso, conclusão, zero, lista vazia, objeto vazio ou reinício.

## Fluxo obrigatório

### 1. Conter antes de investigar

- Congele somente a instalação/operação afetada.
- Desative retomadas automáticas, itens vivos de fila e novos claims dessa operação.
- Preserve ledger, checkpoints, tentativas, erros, fencing e demais evidências.
- Não apague histórico e não reabra uma operação encerrada.
- Confirme por leitura que não restou executor ou item de fila ativo.

### 2. Separar os estados observados

Para cada leitura crítica, modele explicitamente:

- `ok + dado válido`;
- `ok + ausência real`;
- `erro transitório`;
- `erro definitivo`;
- `resposta inválida ou ambígua`.

Estados ambíguos falham fechados e preservam o último estado comprovado. Falha anterior ao acesso ao destino não pode consumir tentativa do destino.

### 3. Fazer varredura completa na primeira ocorrência

Ao encontrar uma ocorrência do antipadrão, não corrija apenas o ponto visível. Varra toda a superfície relacionada, incluindo quando aplicável:

- cadastro e descoberta do recurso;
- cofre, leitura e descriptografia de credenciais;
- chamadas HTTP e parsing das respostas reais;
- operação, claim, lease, heartbeat e fencing;
- checkpoints, ledger e reconciliação;
- fila, outbox, cron e retomada;
- estado local e remoto;
- progresso, percentuais e conclusão;
- build, publicação e validação final.

Entregue um inventário completo: ocorrência, risco, correção e teste dedicado. A liberação fica bloqueada enquanto houver ocorrência sem classificação.

### 4. Corrigir a categoria, não o sintoma

- Preserve progresso monotônico e o último checkpoint comprovado.
- Checkpoint deve ter identidade canônica suficiente, como operação + unidade executável + fingerprint.
- Efeito e checkpoint devem ser persistidos atomicamente sempre que possível.
- Escritas tardias devem ser rejeitadas por lease/fencing.
- `claim` e `yield` saudável não contam como falha; apenas retry por falha real consome tentativa.
- Resposta vazia inesperada nunca reinicia processamento do zero.
- Reconciliação deve ser explícita, auditável e sem apagar evidências.

### 5. Testar cada ocorrência com três controles reais

Cada ocorrência do inventário exige teste comportamental dedicado com:

1. erro/timeout;
2. vazio ou ausência real;
3. resposta válida.

Os fixtures devem ser capturados ou derivados do formato real devolvido pelo banco/API. Antes de escrever o teste, registre o corpo, status e shape reais de cada controle, removendo segredos e dados pessoais.

É proibido substituir a resposta real por uma aproximação conveniente. Exemplo: `[]` não representa `[{ initialized: false }]`.

Além da matriz tripla, inclua a reprodução exata do incidente, com o mesmo checkpoint, estado, ordem de chamadas e falha observada.

### 6. Ensaiar com estado equivalente ao real

Antes de publicar para uma instalação crítica:

- use snapshot/cópia sanitizada ou fixture fiel do estado real;
- preserve cardinalidade, ledger, checkpoints, tentativas e respostas do provedor;
- execute o fluxo completo, não apenas a função corrigida;
- injete crash após commit, perda de resposta, timeout e replay;
- prove que itens concluídos não são repetidos;
- prove que o fluxo chega à validação final esperada.

Mocks unitários são necessários, mas não substituem este ensaio.

### 7. Auditar diretamente os efeitos no destino

Quando houver suspeita de duplicação ou corrupção, análise estática não encerra o incidente. Consulte o destino real em modo somente leitura e verifique, conforme o domínio:

- chaves naturais e grupos duplicados;
- registros excedentes e órfãos;
- contadores inconsistentes;
- jobs, timers, eventos e filas duplicados;
- índices, constraints, funções e triggers repetidos ou ausentes;
- divergência entre ledger/checkpoint e efeitos persistidos.

Registre consultas, horário, escopo, totais e resultado sanitizado. Nunca exponha tokens, chaves ou dados pessoais. Se a credencial estiver indisponível, declare a auditoria bloqueada; não deduza integridade apenas pelo código.

### 8. Cumprir MASTER-first

Toda correção nasce e fecha no MASTER:

1. aplicar código/migration no MASTER;
2. regenerar o delta;
3. sincronizar SHA e versão anunciada;
4. atualizar a verificação da instalação;
5. executar testes focados, ensaio completo e guardiões MASTER-first;
6. apresentar inventário e evidências;
7. obter autorização explícita para publicar;
8. publicar o MASTER;
9. obter autorização explícita separada para retomar a instalação crítica;
10. acompanhar até a validação final e auditar o destino novamente quando houver risco de efeito duplicado.

Nunca faça tentativa e erro no ambiente afetado. Hotfix direto só é aceitável como contenção urgente de segurança ou integridade, deve ser mínimo, auditável e imediatamente incorporado ao MASTER.

## Matriz de evidências para aprovação

Apresente antes de pedir autorização:

| Ocorrência | Resposta real observada | Correção | Erro/timeout | Vazio real | Válida | Reprodução exata | Ensaio completo | Auditoria direta |
|---|---|---|---|---|---|---|---|---|
| identificação | shape/status sanitizado | mudança de comportamento | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL/N/A | PASS/FAIL/BLOQUEADA |

Inclua também:

- versão e SHA do pacote;
- totais dos testes por suíte;
- resultado dos guardiões;
- estado congelado/ativo do destino;
- pendências e bloqueadores;
- autorização ainda necessária.

## Critérios de encerramento

O incidente só pode ser declarado contido quando:

- a varredura completa não deixou ocorrências abertas;
- todos os controles reais passaram;
- a reprodução exata não falha mais;
- o ensaio completo passou;
- a auditoria direta confirmou ausência de corrupção/duplicação ou a reparação foi comprovada;
- MASTER, delta, versão e verificação estão sincronizados;
- a instalação saiu dos estados de falha relevantes após retomada autorizada.

Se qualquer item depender de credencial, aprovação ou serviço externo, mantenha o incidente aberto e nomeie o bloqueador explicitamente.

## Atalhos proibidos

- Corrigir somente a ocorrência que apareceu na interface.
- Tratar `catch` como valor padrão ou ausência.
- Usar fixture que não corresponde ao shape real.
- Declarar segurança ou integridade apenas por revisão de código.
- Consumir tentativa por falha que não tocou o destino.
- Reiniciar do zero após leitura ambígua.
- Publicar e retomar em uma única autorização implícita.
- Apagar tentativas órfãs, ledger ou evidências para “limpar” o estado.
- Liberar uma instalação crítica apenas porque o build e testes unitários passaram.