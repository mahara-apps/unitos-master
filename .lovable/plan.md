# Fechamento automático dos calendários de prazo

## Objetivo
Tornar a edição de prazo em **Projetos > Jobs > Tasks** direta: ao escolher uma data, o calendário salva e fecha imediatamente, sem exigir clique fora.

## Alterações
1. **Controlar a abertura do calendário compacto de prazo**
   - Tornar o seletor compartilhado de prazo controlado pelo próprio componente.
   - Ao selecionar um dia válido, executar a atualização existente e fechar o calendário.
   - Ao clicar em **Remover prazo**, limpar a data e também fechar.
   - Manter fechamento por clique externo e pela tecla `Esc`.

2. **Aplicar de forma consistente no fluxo solicitado**
   - A mudança alcançará o prazo do Job na lista e no modal, além do prazo de cada Task, pois esses pontos reutilizam o mesmo seletor.
   - Não alterar calendários de intervalo, filtros ou campos nativos de data, que têm confirmação e comportamento próprios.

3. **Preservar comportamento e acessibilidade**
   - Manter formato, fuso, destaque de atraso, navegação por teclado e foco do calendário.
   - Garantir interação dentro do modal com `pointer-events-auto`.
   - Não alterar rotas, permissões, dados, regras de negócio ou aparência além do fechamento solicitado.

4. **Validação e MASTER-first**
   - Adicionar testes para seleção e remoção fecharem o calendário e para o uso compartilhado em Jobs e Tasks.
   - Rodar testes focados, checagem de tipos e validação do pacote MASTER.
   - Regenerar o delta e sincronizar a versão do MASTER; como não há estrutura de banco nova, não criar verificação artificial de instalação.
   - Não publicar nem propagar sem autorização explícita.

## Detalhes técnicos
A solução usará o estado `open` do Popover no seletor compartilhado. O fechamento ocorrerá somente depois de encaminhar a data selecionada ou a remoção ao callback já existente, evitando mudanças nas operações atuais de salvamento.
