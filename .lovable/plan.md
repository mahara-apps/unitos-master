# Refinamento visual da linha de tarefas do Job

## Objetivo

Transformar a lista de tarefas em uma leitura rápida, estável e minimalista, usando as referências como direção: o título deve ser o elemento dominante; concluir, timer, status, prioridade, responsável, prazo, subtarefas e menu continuam disponíveis, mas sem disputar espaço nem ultrapassar as margens.

Nenhuma função, regra, dado ou rota será removido.

## Diagnóstico confirmado

- A área das tarefas ocupa cerca de 70% do corpo do modal, pois divide espaço com o painel de contexto.
- A partir de 760 px dessa área, cada tarefa passa diretamente para sete colunas. As colunas fixas de status, prioridade, responsável, prazo e ações deixam somente 160 px mínimos para o título.
- O `TaskTimerWidget` recebe `compact`, mas esse modo altera apenas o contêiner. Ele ainda renderiza relógio, estimativa, estado e botões textuais de iniciar/retomar/pausar/parar, sendo o maior ponto de pressão horizontal.
- O título usa truncamento obrigatório em uma linha; por isso nomes longos ficam ilegíveis mesmo quando a linha poderia crescer verticalmente.
- Em larguras intermediárias, os metadados mudam de uma faixa flexível para colunas rígidas cedo demais. É nesse intervalo que os controles parecem espremidos ou escapam da margem.
- A barra de busca, ordenação, alternância Lista/Quadro e filtros também compete por largura no topo da mesma área.

## Direção visual escolhida

A linha seguirá a referência mais minimalista:

```text
┌──────────────────────────────────────────────────────────────────┐
│ ○  Título da tarefa, com até duas linhas      ▶  avatar  15/09  ⋮ │
│    status · prioridade · subtarefas                              │
└──────────────────────────────────────────────────────────────────┘
```

Em áreas largas, os metadados ficam alinhados em uma única linha. Em áreas médias e pequenas, eles passam para uma segunda faixa deliberada — nunca são apenas comprimidos.

## Plano de implementação

### 1. Criar uma linha de tarefa com responsabilidade visual própria

- Extrair a marcação atual para um componente de apresentação focado na linha, mantendo as mutações e permissões existentes no painel.
- Definir três zonas estáveis:
  1. conclusão;
  2. título e metadados editáveis;
  3. ações rápidas.
- Aplicar `min-w-0` somente onde o conteúdo pode encolher e `shrink-0` nos ícones, avatar, prazo e menu.
- Manter toda a linha dentro do contêiner, sem rolagem horizontal e sem larguras mínimas que ultrapassem a coluna principal.

### 2. Substituir o timesheet expandido por uma única ação contextual

- No modo compacto da lista, mostrar apenas um botão circular:
  - `Play` quando parado ou pausado;
  - `Pause` quando estiver rodando nessa tarefa;
  - estado ocupado enquanto a ação está sendo salva.
- O clique continuará usando exatamente as funções atuais de iniciar e pausar; iniciar uma tarefa continuará respeitando a regra existente para timer ativo em outro item.
- Informar o estado por `aria-label`, tooltip e aparência do ícone, sem texto permanente ocupando a linha.
- O tempo acumulado, a estimativa e a ação de encerrar definitivamente continuam disponíveis ao abrir a tarefa, onde o timer completo já existe. Assim, nenhuma função do timesheet é perdida; apenas a ação rápida é simplificada.
- Quando estiver rodando, usar um destaque discreto e estável, sem animação que altere dimensões. Respeitar `prefers-reduced-motion` caso haja pulso visual.

### 3. Dar prioridade real ao título

- Remover o truncamento rígido de uma linha.
- Exibir até duas linhas com altura previsível na lista; títulos curtos continuam em uma linha.
- Disponibilizar o texto integral no tooltip nativo e manter o clique abrindo o detalhe da tarefa.
- Reservar uma largura útil mínima para o título antes de permitir a disposição desktop dos metadados.
- Tarefas concluídas preservam o risco e a cor secundária, sem reduzir a legibilidade.

### 4. Corrigir os breakpoints pelo espaço real do painel

Usar consultas do contêiner da área principal, não a largura total da janela:

- **Largo:** título flexível e controles compactos na mesma faixa.
- **Intermediário:** conclusão, título, timer e menu na primeira faixa; status, prioridade, responsável, prazo e subtarefas na segunda.
- **Estreito:** título com duas linhas; metadados quebram em grupos pequenos e alinhados, com espaçamento consistente.

A passagem para a versão larga só ocorrerá quando houver espaço suficiente para um título confortável, eliminando o salto atual em 760 px que cria a compressão.

### 5. Compactar metadados sem esconder funções

- Status continua pesquisável e editável, mas usa uma pílula compacta com largura máxima e texto truncado internamente.
- Prioridade continua editável, com gatilho curto e largura previsível.
- Responsável permanece como avatar; nome completo fica no tooltip e na lista de seleção.
- Prazo permanece editável; data usa `dd/mm` e o estado sem data usa somente calendário ou rótulo curto conforme o espaço.
- Subtarefas permanecem no popover existente, com botão de ícone.
- Arquivar e excluir permanecem no menu de três pontos.
- Todos os ícones terão área de clique consistente, foco visível e nome acessível.

### 6. Ajustar densidade, margens e alinhamento

- Uniformizar altura dos controles rápidos e o eixo vertical dos ícones.
- Manter margens laterais iguais às do cabeçalho da lista e impedir que o menu encoste na divisória do painel de contexto.
- Usar separadores leves entre tarefas, sem transformar cada linha em cartão.
- Aumentar levemente a altura apenas quando o título ou a segunda faixa precisar; evitar espaços vazios em tarefas curtas.
- Garantir que loading, tarefa concluída, tarefa arquivada, prazo atrasado, sem responsável e sem status não alterem a geometria da linha.

### 7. Reorganizar a barra superior da lista

- Preservar busca, ordenação, Lista/Quadro e filtros.
- Em largura larga, manter uma faixa única alinhada.
- Em largura intermediária, separar resumo e ferramentas em duas linhas estáveis.
- Em largura estreita, busca ocupa a largura disponível e os demais controles ficam em uma grade compacta, sem extrapolar a margem.
- Contadores de tarefas e tempo não serão removidos.

### 8. Preservação funcional e de navegação

- Preservar criação, conclusão/reabertura, status, prioridade, responsável, prazo, timer, subtarefas, arquivamento, exclusão, busca, ordenação, Lista/Quadro e abertura do detalhe.
- Preservar `/projects/$projectId`, `tab=jobs`, `job=<uuid>`, `pauta`, `board` e `estagio` sem criar, remover, renomear ou redirecionar rotas.
- Não alterar RBAC, RLS, autenticação, consultas ou formato dos dados.
- Não incorporar as imagens enviadas; elas serão usadas somente como referência visual.

## Validação

- Cobrir por teste a existência da ação compacta Play/Pause e a permanência do timer completo no detalhe da tarefa.
- Cobrir a preservação de status, prioridade, responsável, prazo, subtarefas e menu na linha.
- Testar títulos curtos e longos, estados parado/pausado/rodando, dados ausentes e prazos atrasados.
- Verificar visualmente o modal em 1203 × 864, além de larguras desktop ampla, tablet e celular, procurando overflow horizontal, sobreposição, corte de texto e deslocamento de controles.
- Executar os testes focados, verificação de tipos e checagem do pacote MASTER.

## Entrega MASTER-first

- Aplicar a alteração no código do MASTER.
- Regenerar o pacote com `build_delta.py`.
- Sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION` com a mesma nova versão e o SHA gerado.
- Confirmar que a verificação de instalação continua cobrindo o pacote; como esta correção é visual e não cria estrutura de banco, não será adicionado check artificial ao SQL.
- Executar `bun run master:check` e os guardiões de sincronização.
- Não publicar nem propagar para outras instalações sem autorização explícita.
