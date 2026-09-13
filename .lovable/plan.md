# Plano — detalhe do Job central, organizado e responsivo

## Diagnóstico confirmado

O problema não é falta de espaço apenas; é a forma como o espaço está sendo distribuído:

- O detalhe usa hoje um painel preso à lateral (`Sheet`) com altura total e quase toda a largura da tela. Ele parece uma segunda página espremida, não um modal com foco.
- Concluir, responsável, prazo, timer, status, colaboradores, compartilhar e menu disputam a mesma faixa flexível. Quando não cabem, quebram em uma ordem visual imprevisível.
- A linha de tarefa só assume suas sete colunas em telas `xl`. Na largura atual de 1203 px, ela cai para duas colunas e status, prioridade, responsável, prazo, timer, subtarefas e menu são redistribuídos em linhas soltas — a principal origem da aparência “quebrada”.
- Título, breadcrumb, período e datas ocupam três faixas consecutivas com peso parecido, antes de o usuário chegar às tarefas.
- O painel contextual mantém largura fixa, enquanto a área de trabalho precisa acomodar busca, ordenação, lista/quadro e tarefas densas.
- “Comentários” aparece na aba e novamente dentro do conteúdo, criando hierarquia duplicada.

## Direção visual

Transformar o detalhe em uma janela central de trabalho: ampla, silenciosa e com limites claros. A identidade do Job vem primeiro; ações e metadados ficam organizados em blocos previsvisíveis; tarefas recebem a maior área; informações de apoio permanecem acessíveis sem competir com o trabalho principal.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ #7.1  Planejamento             Cliente › Projeto        compartilhar │
│        [Concluir]  Responsável  Status  Prazo  Timer             …  × │
├──────────────────────────────────────────────────────────────────────┤
│ Período  início ───────── hoje ───────── entrega                     │
├──────────────────────────────────────────────┬───────────────────────┤
│ TAREFAS                         busca/filtros │ Comentários Anexos…   │
│ ──────────────────────────────────────────── │                       │
│ ○ Nome da tarefa                             │ conteúdo da aba       │
│   status · prioridade · responsável · prazo  │                       │
│                                              │                       │
│ + Adicionar tarefa                           │                       │
│                                              │                       │
│ BRIEFING                                     │                       │
│ editor                                       │                       │
└──────────────────────────────────────────────┴───────────────────────┘
```

## Mudanças propostas

### 1. Modal central verdadeiro

- Substituir o painel lateral por um `Dialog` centralizado, preservando abertura e fechamento pelo parâmetro `job` da URL.
- Usar largura fluida com limite amplo, altura máxima com margem visível ao redor e cantos discretos.
- Manter o fundo da página visível sob uma sobreposição sóbria, reforçando que o usuário continua dentro do Projeto.
- Cabeçalho e abas permanecem fixos; somente as áreas de conteúdo rolam.
- Em telas menores, ocupar quase toda a tela sem cortar controles; no celular, assumir apresentação de tela cheia com seções empilhadas.

### 2. Cabeçalho em duas camadas, sem competição

- Primeira camada: código, nome do Job e breadcrumb à esquerda; colaboradores, compartilhar, menu e fechar à direita.
- Segunda camada: Concluir, responsável, status, prazo e timer em uma grade de metadados com larguras estáveis.
- Cada campo terá rótulo curto e valor alinhado, evitando que pills e seletores pareçam controles desconectados.
- Compartilhar e menu continuam como ícones com tooltip; nenhuma ação será removida.

### 3. Período compacto

- Reunir início, progresso temporal e entrega em uma única faixa baixa.
- Datas editáveis continuam disponíveis, mas integradas aos extremos da linha do tempo em vez de repetidas abaixo dela.
- Exibir atraso, entrega hoje ou dias restantes com contraste sem transformar a faixa em um novo cabeçalho.
- Quando não houver datas, mostrar uma ação discreta para defini-las, sem uma barra vazia dominante.

### 4. Área principal com proporções estáveis

- Desktop amplo: tarefas/briefing ocupam aproximadamente 70%; contexto ocupa aproximadamente 30%, com mínimo seguro para ambos.
- Notebook: manter duas colunas enquanto houver espaço real; reduzir densidade dos controles antes de quebrar a estrutura.
- Tablet e celular: contexto passa para uma seção abaixo da área principal, mantendo as quatro abas.
- Remover combinações de largura fixa que comprimem a lista.

### 5. Tarefas reorganizadas

- Preservar busca, ordenação, filtros, alternância Lista/Quadro, criação, conclusão, status, prioridade, responsável, prazo, timer, subtarefas, arquivar e excluir.
- Cabeçalho da seção em duas zonas estáveis: resumo à esquerda; ferramentas à direita. Em largura menor, as ferramentas ocupam uma segunda linha inteira.
- Cada tarefa terá:
  - linha principal com checkbox, título e menu;
  - linha/colunas secundárias com status, prioridade, responsável, prazo, timer e subtarefas;
  - dimensões reservadas para impedir saltos e sobreposição.
- A grade será definida por espaço disponível no modal, não pelo tamanho total da janela. Assim, o comportamento não quebra novamente em notebooks.
- No Quadro, manter arrastar e soltar, colunas e abertura da tarefa, apenas ajustando altura e rolagem ao novo modal.
- A criação de tarefa ficará em uma faixa própria, imediatamente após a lista, com título predominante e prazo/ação compactos.

### 6. Briefing com mais respiro

- Separar visualmente o Briefing das tarefas por espaço e título, sem criar um card dentro do modal.
- Manter integralmente o editor, formatação, links, imagens, emoji e salvamento automático.
- Barra do editor poderá rolar horizontalmente em telas estreitas, em vez de quebrar em várias linhas desordenadas.
- Definir altura mínima confortável e limitar o crescimento para não empurrar o restante sem controle.

### 7. Painel de contexto limpo

- Preservar Comentários, Anexos, Timesheet e Histórico.
- Abas terão largura e rolagem horizontal controladas quando necessário.
- Remover o cabeçalho “Comentários” duplicado dentro da própria aba; manter contagem e estado vazio no conteúdo.
- Comentários usarão lista rolável e campo de resposta fixo no rodapé do painel.
- Timesheet e Histórico manterão todos os dados, com espaçamento e divisores consistentes.
- Anexos e links continuarão usando o componente e as funções atuais.

### 8. Estados e acabamento

- Manter estados de carregamento, vazio, salvando, erro, timer ativo, atrasado, concluído e arquivado.
- Garantir foco inicial, fechamento por `Esc`, navegação por teclado e retorno de foco ao Job de origem.
- Respeitar os tokens, tipografia, botões e densidade existentes do Unitos; sem introduzir nova paleta ou efeitos decorativos.
- Conferir textos longos, nomes de responsáveis, datas, zoom do navegador e ausência de sobreposição.

## Preservação funcional e de navegação

- Não criar, remover, renomear ou redirecionar rotas.
- Preservar `/projects/$projectId`, `tab=jobs`, `job=<uuid>`, `pauta`, `board` e `estagio`.
- Abrir um Job continuará atualizando `job` na URL; fechar continuará removendo apenas esse parâmetro.
- Permanecem todas as ações atuais: concluir/reabrir, responsável, status, datas, timer, colaboradores, compartilhar, duplicar, renomear, estimativa, arquivar/restaurar, excluir, tarefas, briefing e quatro abas contextuais.
- Nenhuma alteração de banco, RLS, RBAC ou regras de negócio está prevista.

## Validação

- Validar visualmente o modal central em desktop amplo, 1203 × 864 (largura atual), tablet e celular.
- Testar Job com muitas tarefas, nomes longos, timer ativo, datas atrasadas e painel de comentários preenchido.
- Testar Lista e Quadro, arrastar tarefa, edição de metadados, criação de tarefa, briefing e todas as abas.
- Confirmar abertura por link direto, atualização do parâmetro `job`, fechamento, voltar/avançar do navegador e preservação dos demais parâmetros.
- Atualizar os testes de estrutura visual e navegação sem alterar contratos funcionais.
- Aplicar no MASTER, regenerar o pacote conforme o fluxo obrigatório, sincronizar a versão e executar `bun run master:check`, testes focados, checagem de tipos e validação do preview.
- Não publicar nem propagar para instalações sem autorização explícita.
