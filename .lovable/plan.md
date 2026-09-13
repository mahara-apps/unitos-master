# Correção visual da lista de Jobs

## Diagnóstico confirmado

A diferença não vem das rotas nem da existência dos cinco status. Ela foi causada pela forma como a lista foi montada:

- A tela atual inicia com **Agrupar por: Status**; o HTML de referência inicia em **Agrupar: Nenhum**.
- No agrupamento por status, a implementação atual cria e exibe todos os cinco grupos, inclusive vazios.
- Como os três jobs do exemplo estão sem status, eles ficam concentrados em **Sem status**, depois de cinco blocos vazios.
- Cada grupo ganhou sua própria superfície e mensagem “Nenhum job neste grupo”, aumentando muito a altura e transformando a página numa sequência de blocos.
- No HTML, o estado inicial é uma única lista compacta. Os cabeçalhos de status aparecem somente quando o usuário escolhe agrupar e, na referência, grupos vazios não ocupam espaço.
- A linha do job já contém número, nome, progresso, tempo, equipe, prazo, status e menu, mas ficou visualmente comprimida porque a estrutura de agrupamento tomou o protagonismo.

Portanto, o erro foi interpretar o agrupamento por status como estrutura permanente da lista, quando ele deveria ser apenas uma visualização opcional.

## Correção visual

### 1. Estado inicial fiel ao HTML

- Adicionar **Nenhum** às opções de agrupamento e torná-lo o padrão.
- Ao abrir Jobs, mostrar todos os jobs em uma única superfície contínua.
- Manter **Adicionar um job** como a última linha da mesma superfície.
- Não exibir cabeçalhos ou mensagens de grupos de status nesse estado.

### 2. Agrupamento apenas quando solicitado

- Manter **Status**, **Responsável** e **Prazo** como opções.
- Ao escolher **Status**, mostrar somente grupos que tenham jobs, seguindo a referência visual.
- Manter o botão `+` contextual no cabeçalho de cada grupo visível.
- Tratar **Sem status** como grupo normal apenas quando houver jobs sem status.
- Aplicar o mesmo princípio aos agrupamentos por responsável e prazo: não criar grandes blocos vazios.

### 3. Lista compacta e hierarquia correta

- Reorganizar o painel para que a toolbar e a lista sejam os elementos principais, reduzindo bordas e espaços verticais excedentes.
- Ajustar as linhas para reproduzir a leitura horizontal do HTML: número, nome, progresso, tempo, equipe, prazo, status e menu.
- Preservar a adaptação para telas menores, levando informações secundárias para uma segunda faixa sem remover ações.
- Manter o seletor de status dentro de cada linha; ele é um campo funcional do job e aparece no HTML como pill. O que será removido do estado inicial são os **blocos de agrupamento**, não o status do job.

### 4. Toolbar e acessos superiores

- Manter os acessos separados **Jobs** e **Pautas**.
- Alinhar título, contagem, agrupamento, Lista/Quadro, busca, filtros e **Novo job** com a ordem e densidade da referência.
- Exibir o agrupamento atual como `Agrupar: Nenhum`, `Status`, `Responsável` ou `Prazo`.

### 5. Quadro e funções preservadas

- Manter o Quadro em kanban por status e o arrastar-e-soltar.
- Preservar busca, filtros, criação, edição de status, responsável, prazo, duplicação, conclusão, arquivamento, restauração e exclusão.
- Não alterar o drawer do job, Pautas, Visão geral, Comentários, Anexos, rodapé de horas ou outras telas.

## Rotas preservadas

Nenhuma rota será criada, removida, renomeada ou redirecionada.

- `/projects/$projectId` permanece intacta.
- `tab=jobs` continua abrindo Jobs & Pautas.
- `job=<uuid>` continua abrindo o drawer diretamente.
- `pauta`, `board` e `estagio` continuam compatíveis.
- Agrupamento e Lista/Quadro permanecem estados locais da tela.

Não é necessária rota alternativa.

## Validação

- Comparar novamente o estado inicial com o HTML e a imagem de referência.
- Confirmar lista única ao abrir, sem os cinco grupos vazios.
- Testar os quatro agrupamentos: Nenhum, Status, Responsável e Prazo.
- Testar criação global e contextual, status pesquisável, filtros, busca e Quadro com arrastar-e-soltar.
- Confirmar drawer, deep link, Pautas, abas e parâmetros existentes.
- Validar desktop e mobile, testes focados, tipos, logs e guardiões MASTER-first.
- Regenerar e sincronizar o pacote MASTER somente se a mudança afetar o pacote distribuído; não publicar nem propagar sem autorização explícita.
