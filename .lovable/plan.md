# Arraste visível no quadro de peças do projeto

## Objetivo
Ao arrastar uma peça no quadro da pauta, mostrar a própria peça acompanhando o cursor e indicar claramente a etapa de destino, como no Kanban de tarefas. A mudança continua acontecendo apenas ao soltar em uma etapa válida.

## Plano
1. Ajustar somente o quadro de peças do projeto: reaproveitar o padrão de arraste do Kanban de tarefas, exibindo uma cópia visual da peça durante o movimento e mantendo sua posição original discretamente marcada. Destacar a coluna de destino enquanto o cursor estiver sobre ela.
2. Respeitar as restrições já existentes: somente peças com identificação e etapa reais podem ser movidas; apenas entre etapas do mesmo pipeline; soltar fora de uma etapa válida ou cancelar não altera nada. Preservar o clique para abrir a peça e as visões Lista/Matriz.
3. Cobrir o arraste, cancelamento e destinos inválidos com testes focados; conferir visualmente em tamanhos de tela distintos quando houver acesso à tela autenticada, além de verificar tipos e resultados das checagens do projeto. Relatar explicitamente qualquer verificação visual bloqueada por acesso.
4. Incluir a alteração no pacote MASTER, sincronizar versão e assinatura, confirmar que nenhum campo, tabela, política ou rota nova é necessário e executar `bun run master:check`. Executar a suíte global sem relaxar seus critérios; se o acesso ao projeto de testes continuar recusado, manter essa pendência visível.
5. Não publicar nem atualizar as demais instalações sem sua autorização explícita e sem tratar os bloqueios de validação.

## Detalhe técnico
O quadro de peças usa `useDraggable`, mas hoje só reduz a opacidade do cartão durante o arraste: não aplica o deslocamento visual nem usa `DragOverlay`. O Kanban de tarefas já usa `DragOverlay` e controla a peça ativa. A adaptação deve ficar no componente existente do quadro de peças e continuar usando o movimento atual (`onMoveItem`/`movePostFn`), sem mudanças de banco ou permissões.