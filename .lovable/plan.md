# Correção definitiva do cabeçalho de Projeto, Jobs e Pautas

## Diagnóstico confirmado

O cabeçalho atual mistura três contextos diferentes:

- **Projeto:** nome, cliente, responsável, status do projeto e ações.
- **Jobs:** lista, progresso das tarefas, tempo, responsáveis, prazo e status de cada job.
- **Pautas:** peças concluídas e etapas Briefing, Em produção, Em revisão, Aprovado, Agendado e Publicado.

Os indicadores superiores não são status de Job nem status do Projeto: eles são calculados a partir das peças da Pauta. Porém, hoje o `ProjectHeader` os recebe e exibe em todas as abas, inclusive **Jobs & Pautas**. Isso cria uma associação visual incorreta entre Jobs e etapas editoriais.

Há também um problema estrutural: identidade, progresso editorial, funil e ações são irmãos dentro da mesma grade flexível. Em larguras intermediárias e grandes, esses blocos disputam colunas e quebram a leitura do cabeçalho.

A tela **Visão geral** já possui o bloco correto “Pipeline de conteúdo”. Portanto, o mesmo funil no cabeçalho é redundante.

## Resultado esperado

### Cabeçalho global do Projeto

Será um cabeçalho compacto e estável em todas as abas, contendo somente:

- marcador de cor e nome do projeto;
- cliente;
- responsável;
- status pesquisável do **Projeto**;
- acesso “Ver pauta”, quando existir;
- menu de ações do projeto.

Ele não exibirá contagem de peças, percentual editorial nem etapas de Pauta.

### Visão geral

- Mantém os quatro indicadores numéricos já existentes.
- Mantém “Pipeline de conteúdo” como bloco próprio e claramente identificado.
- O clique nas etapas continua abrindo a visualização de Pautas filtrada.
- Não haverá repetição do pipeline no cabeçalho.

### Jobs & Pautas — modo Jobs

- O topo mostrará apenas o contexto do Projeto e, abaixo, os acessos separados **Jobs** e **Pautas**.
- A área de Jobs começa diretamente com sua toolbar e lista/quadro.
- Os únicos status visíveis nessa área serão status de Job.
- Nenhuma etapa editorial de Pauta aparecerá acima da lista de Jobs.

### Jobs & Pautas — modo Pautas

- As etapas Briefing, Em produção, Em revisão, Aprovado, Agendado e Publicado aparecerão somente dentro do contexto de Pautas.
- O bloco terá título explícito, como “Pipeline da pauta” ou “Pipeline de conteúdo”, para não parecer status do Projeto ou dos Jobs.
- Contagem, percentual e filtros continuarão ligados às peças, sem alterar sua lógica.

## Alterações visuais

1. Simplificar o cabeçalho para uma única faixa com hierarquia clara e alinhamento consistente.
2. Separar identidade à esquerda e controles do Projeto à direita, com quebra responsiva previsível.
3. Remover do cabeçalho global a faixa de período, “peças concluídas”, percentual e o funil editorial.
4. Manter status da Pauta em badge identificado como **Pauta**, sem confundi-lo com o seletor de status do Projeto.
5. Preservar o padrão visual do Unitos: superfícies, tipografia, espaçamento, botões e tokens existentes.
6. Garantir que, em telas menores, os controles quebrem abaixo do nome sem sobreposição ou desalinhamento.

## Preservação funcional e de navegação

Nenhuma rota será criada, removida, renomeada ou redirecionada.

Continuam válidos:

- `/projects/$projectId`;
- abas `overview`, `jobs`, `comments` e `links`;
- parâmetros `tab`, `job`, `pauta`, `board` e `estagio`;
- abertura do drawer do Job;
- acesso e filtros da Pauta;
- alternância Lista/Quadro e drag-and-drop dos Jobs;
- edição de responsável e status do Projeto;
- “Ver pauta” e menu de ações.

## Implementação técnica

- Tornar `ProjectHeader` exclusivamente responsável pela identidade e pelos controles do Projeto, removendo os slots editoriais `periodLabel`, `done`, `total`, `stages` e a variação `compact`.
- Atualizar a página do Projeto para não enviar dados de Pauta ao cabeçalho.
- Manter `StageFunnel` na Visão geral e reutilizá-lo apenas no contexto de Pautas quando esse contexto estiver aberto.
- Ajustar a composição de `JobsPanel` para que Jobs e Pautas sejam acessos contextuais, não uma continuação do cabeçalho editorial.
- Atualizar testes para impedir regressão: o cabeçalho global não pode conter etapas editoriais; o pipeline deve existir na Visão geral/Pautas; Jobs deve manter seus cinco status próprios.

## Validação

- Conferir visualmente desktop e mobile nas abas Visão geral, Jobs, Comentários e Anexos.
- Conferir os modos Lista, Quadro e Pautas dentro de Jobs & Pautas.
- Testar os parâmetros existentes diretamente por URL e confirmar o drawer do Job.
- Rodar testes direcionados, checagem de tipos, integridade visual básica e checagem MASTER.
- Aplicar a sequência MASTER-first exigida, sem publicar nem propagar para instalações sem autorização explícita.
