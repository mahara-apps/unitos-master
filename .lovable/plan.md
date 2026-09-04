# Concluir a vinculação das contas Meta a um cliente

Hoje, ao autorizar a Meta e abrir "Selecione as contas da Meta", a tela lista os perfis e cada
chave liga a conta imediatamente ao workspace — mas não existe rodapé, resumo nem passo para
dizer **a qual cliente** aquelas contas pertencem. A única saída é o "X", o que deixa a
impressão de que nada foi concluído.

## O que vai mudar (visual e fluxo)

1. **Cabeçalho claro**
   - Título visível "Selecione as contas da Meta" com subtítulo: "Ative as contas que você quer
     usar e depois escolha o cliente."
   - "Sincronizar" continua no mesmo lugar.

2. **Resumo de seleção fixo no rodapé**
   - "N conta(s) ativada(s) nesta sessão" com os nomes das últimas ativadas.
   - Aviso curto: contas ativadas já ficam salvas no workspace, mesmo se a tela for fechada.

3. **Escolha do cliente no próprio rodapé**
   - Um seletor "Vincular ao cliente" com a lista de clientes do workspace (busca por nome).
   - Botão **Vincular e concluir**: aplica o vínculo das contas ativadas ao cliente escolhido e
     fecha a tela com confirmação ("2 contas vinculadas a Taveira").
   - Botão secundário **Concluir sem cliente**: mantém as contas no workspace para vincular
     depois na aba do cliente. Assim ninguém fica preso na tela.
   - Se a tela foi aberta já dentro de um cliente, o seletor vem preenchido e travado nesse
     cliente.

4. **Conta já vinculada a outro cliente**
   - Mensagem explicando qual cliente já usa aquela conta e o que fazer (desvincular primeiro),
     em vez de erro genérico.

5. **Fechar pelo "X"**
   - Passa a confirmar: "As contas ativadas ficaram salvas no workspace. Vincular a um cliente
     agora?" — com as opções Vincular / Sair.

## Detalhes técnicos

- `src/components/connections/meta-portfolio-dialog.tsx`: `MetaAssetsPanel` recebe um rodapé
  opcional (`renderFooter` / props de conclusão) e passa a registrar os `connectionId` ligados
  na sessão atual; `MetaPortfolioDialog` ganha header visível + rodapé com seletor de cliente,
  "Vincular e concluir" e "Concluir sem cliente".
- Vínculo por cliente reutiliza `toggleClientChannelFn` (`src/lib/client-channels.functions.ts`)
  — nenhuma alteração de backend, RLS ou schema. A exclusividade por cliente já é validada lá,
  e a mensagem de erro dela será exibida como texto explicativo.
- Lista de clientes vem da server function já usada nas telas de conexões (mesma origem de
  `clients-channels-table.tsx`), sem nova consulta ao banco.
- Invalidação de cache mantém as chaves atuais (`meta-connections`, `client-channels`,
  `channels-kpis`, `social-analytics`).
- O fluxo dentro do modal "Conectar canais" (etapa Ativos) mantém o botão "Concluir" atual e
  apenas herda o seletor de cliente quando nenhum cliente estiver definido.
- Testes: caso unitário para a regra de conclusão (contas ativadas + cliente escolhido → vínculo;
  sem cliente → conclui mantendo no workspace).
