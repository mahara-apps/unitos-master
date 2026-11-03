# Ajustes pedidos pela equipe (áudio + lista)

Cada item vira uma versão do MASTER, validada antes do próximo, seguindo o fluxo MASTER-first. Nada muda em permissões: cada pessoa continua vendo só os clientes e projetos a que tem acesso.

## 1. Ver e concluir sub-tasks direto na lista de Tarefas
- Cada task ganha uma setinha. Ao clicar, as sub-tasks aparecem logo abaixo, sem abrir outra tela (como no ClickUp).
- Em cada sub-task: marcar como feita, dar play/pausar no tempo e ver o responsável.
- Um botão no topo "Mostrar sub-tasks" abre ou fecha todas de uma vez. A escolha fica salva para a pessoa.

## 2. Projetos em Kanban
- Em Projetos aparece a opção "Lista | Kanban".
- No Kanban, as colunas são os status de projeto que já existem em Status de trabalho. Arrastar o projeto muda o status dele.
- As tasks de dentro do projeto não mudam ao arrastar. Só o projeto muda de coluna.
- Os nomes e a ordem das colunas são configurados em Status de trabalho, iguais para o workspace inteiro.

## 3. Renomear tarefas e sub-tarefas
- É só clicar no nome da task ou sub-task (na lista e na tela de detalhe) e editar. Enter salva, Esc cancela.
- Quem pode editar a task também pode renomear. O histórico continua, e nada precisa ser apagado e criado de novo.

## 4. Pauta a partir de "Todos os clientes"
- Hoje, em "Todos os clientes", o botão Pauta não deixa escolher para qual cliente gerar.
- Agora abre uma janela "Para qual cliente?", com só os clientes a que o colaborador tem acesso. Depois, segue o fluxo normal da pauta daquele cliente.

## 5. Conteúdos em "Todos os clientes" igual à visão de um cliente
- A tela fica com o mesmo formato de quando há um cliente selecionado: mesmas colunas, cartões e filtros, e um selo com o nome do cliente em cada peça.
- O botão "Novo conteúdo" aparece também ali. Ao criar, a primeira escolha é o cliente.

## 6. Roteiros e capa do Reels (pergunta)
- **Resposta:** sim, o roteiro do Reels já é escrito pela IA (agente Roteirista Social), antes da legenda. Ele fica na aba Roteiro da peça.
- **Hoje a IA não diz nada sobre a capa:** se o vídeo tem capa e qual frase vai nela.
- **Proposta:** o roteiro do Reels passa a trazer um bloco "Capa", com três partes:
  - Se tem capa: sim ou não.
  - Frase da capa: até cerca de 8 palavras.
  - Nota para o designer.
- O bloco "Capa" pode ser editado e é só texto, sem gerar imagem. Ele nunca vai para a legenda publicada.
- Peças que já existem ganham o bloco ao clicar em "Refazer".

## Ordem sugerida
3 → 1 → 4 → 5 → 2 → 6. Começamos pelos mais simples e mais pedidos.

## Detalhes técnicos
- 1: projeção read-only existente (`work-items`), carregando as sub-tasks quando a task é expandida. A conclusão e o tempo usam as mesmas funções da tela de detalhe. A preferência é guardada por usuário.
- 2: um quadro em `projects.index.tsx` usando os `work_statuses` do escopo projeto. Arrastar atualiza só `projects.status`, respeitando a RLS. Não mistura com as etapas de conteúdo.
- 3: edição do título dentro da própria linha, pela mesma mutation de update. A RLS não muda.
- 4/5: seletor de cliente filtrado por `can_access_client`. `content.tsx` passa a usar o mesmo layout nas duas visões.
- 6: schema do roteirista ganha `cover: { has_cover, text, designer_note }` normalizado, salvo na peça junto do roteiro. A higiene de legenda também bloqueia o texto da capa.
- Cada etapa: testes das regras novas, `build_delta.py`, versão sincronizada, `verify-installation` e `master:check`. Publicar só com autorização.
