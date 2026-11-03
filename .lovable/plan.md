# Pendências do plano "Ajustes pedidos pela equipe"

## Já entregue (MASTER 1.4.82, ainda não publicado)
- 1. Sub-tasks expansíveis na lista, com concluir, play, status e "Mostrar sub-tasks" salvo por pessoa.
- 2. Projetos em Kanban, colunas pelos status de projeto; arrastar muda só o projeto.
- 3. Renomear task, sub-task e checklist no próprio lugar.
- 4. Pauta em "Todos os clientes" pede o cliente (só os permitidos).
- 6. Bloco "Capa" no roteiro do Reels, fora da legenda.
- 7 (parcial): "Voltar para [origem]", timer fixo no topo, "Editar peça aqui" na pauta, "Abrir peça" na task.

## O que falta
1. **Conteúdos em "Todos os clientes" igual à visão de um cliente (item 5)** — hoje só ganhou os botões; falta o mesmo quadro (colunas, cartões, filtros) com selo do cliente em cada peça.
2. **Atalhos dentro da peça (item 7)** — botões "Ir para a tarefa" e "Ir para a pauta".
3. **Ações rápidas nos cartões (item 7)** — play/pausar, mudar etapa e marcar feito direto no cartão do Kanban de Conteúdo e do Kanban de Projetos (hoje só arrastar).
4. **Painel lateral com link compartilhável (item 7)** — task e peça abrem por cima e o endereço muda (`?task=`/`?post=`), fechando volta para a lista. Conteúdo já aceita `?post=`; falta em Tarefas/Projetos.
5. **Rolagem no "Voltar" (item 7)** — voltar ainda não garante a mesma posição de rolagem.
6. **Conferência logado e publicação** — telas ainda não testadas com usuário real; publicar o MASTER e autorizar a atualização na Casa 8.

## Ordem sugerida
1 → 2 → 3 → 4 → 5, depois conferência e publicação (com sua autorização).

## Detalhes técnicos
- 1: reaproveitar o quadro de `content.tsx` alimentado por todos os clientes permitidos (RLS), com badge de cliente; criação usa o seletor de cliente existente.
- 2: no `task-dialog`, ler vínculos `work_links`/`monthly_plan_topic_id` e navegar registrando a trilha.
- 3: botões no cartão usando `movePostFn` (com confirmação de produção) e as funções de tempo já existentes.
- 4: search params validados com `fallback`; modais controlados pela URL.
- 5: guardar `scrollY` na trilha `nav-trail` e restaurar após navegar.
- Cada etapa: testes das regras, `build_delta.py`, versão sincronizada, `master:check`.
