# Corrigir o modal "Novo projeto a partir de modelo"

## O que está errado
- O resumo de revisão ("Revisão · …, tasks, sub-tasks, Cliente, Pessoas aptas…") foi colocado por engano **dentro de cada cartão de modelo**, então aparece repetido em todos e vaza para fora do modal ao selecionar um.
- Os cartões não quebram linha: descrição ("Estrutura padrão…"), selo "Sistema" e "N tasks · N sub-tasks" ficam numa linha só e saem da caixa.

## Correção
- Resumo de revisão aparece **uma única vez**, abaixo da lista de modelos, só para o modelo selecionado.
- Cartão de modelo em coluna: linha 1 = ícone + nome (até 2 linhas) + selo "Sistema" à direita; linha 2 = descrição (até 2 linhas, com reticências); linha 3 = "N tasks · N sub-tasks".
- Textos longos quebram dentro do cartão; nada ultrapassa a borda do modal.
- Lista de modelos com rolagem própria quando houver muitos, mantendo nome, cliente e botões sempre visíveis.
- Nenhuma mudança em regras, dados ou permissões — só apresentação.

## Detalhes técnicos
- `src/components/projects/new-from-template-dialog.tsx`: mover o bloco `{selected && …Revisão…}` para fora do `templates.map`, após o grid.
- Botão do cartão: `whitespace-normal flex-col items-stretch`, `min-w-0` nos contêineres, `line-clamp-2`/`break-words` no nome e descrição, `shrink-0` no ícone e no selo.
- Grid com `max-h-[40vh] overflow-y-auto`; `DialogContent` com `max-h-[90vh] overflow-y-auto`.
- Verificar no navegador com nomes longos (1280px e celular).
- MASTER-first: sem migração; build_delta (sha inalterado), versão 1.4.86 em delta_version/MASTER_RELEASE_VERSION, `bun run master:check`.
