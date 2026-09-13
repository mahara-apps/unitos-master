# Identificação visual de Jobs e Tasks finalizados

## Objetivo
Deixar Jobs e Tasks imediatamente reconhecíveis quando estiverem **concluídos**, **cancelados** ou **arquivados**, com tons suaves inspirados na referência, sem alterar nenhuma ação, rota ou regra existente.

## Tratamento visual
- Aplicar o destaque tanto na **Lista** quanto no **Quadro** de Jobs e Tasks.
- Usar três estados visuais semânticos:
  - **Concluído:** fundo verde muito suave, ícone de confirmação e texto secundário discreto.
  - **Cancelado:** fundo vermelho muito suave, ícone de cancelamento e texto secundário discreto.
  - **Arquivado:** fundo cinza suave, ícone de arquivo e conteúdo levemente esmaecido.
- Manter contraste, legibilidade e suporte equivalentes nos temas claro e escuro por meio de tokens semânticos.
- Usar prioridade visual determinística quando houver sobreposição: **arquivado → cancelado → concluído → ativo**.

## Identificação dos estados
- Considerar **arquivado** quando existir a marca de arquivamento já usada pelo sistema.
- Considerar **cancelado** quando o status selecionado for “Cancelado” ou “Cancelada”, sem depender de maiúsculas ou acentos.
- Considerar **concluído** pelas marcas atuais de conclusão e pelos status configurados como “conta como concluído”.
- Não criar um novo fluxo de status e não mudar o significado dos dados atuais.

## Lista de Jobs
- Aplicar o tom à linha inteira, preservando número, título, progresso, tempo, pessoas, prazo, status e menu.
- Acrescentar um indicador textual compacto — “Concluído”, “Cancelado” ou “Arquivado” — sem substituir a pílula de status editável.
- Manter disponíveis **Concluir/Reabrir**, **Arquivar/Restaurar**, duplicar, editar e excluir.

## Tasks dentro do Job
- Aplicar o mesmo sistema visual à linha da Task, sem comprimir novamente o título e sem retirar timer, responsável, prazo, prioridade, subtarefas ou menu.
- Diferenciar o ícone inicial: confirmação para concluída, cancelamento para cancelada e arquivo para arquivada.
- Preservar a possibilidade de alterar o status, concluir/reabrir e arquivar/restaurar.

## Quadros
- Aplicar o mesmo tom suave aos cards de Job e Task.
- Manter drag-and-drop, abertura, menus e agrupamentos atuais intactos.
- Exibir o indicador compacto do estado no card sem competir com o status/coluna.

## Implementação técnica
- Centralizar a resolução do estado visual em um helper compartilhado, evitando regras diferentes entre linha e quadro.
- Criar tokens semânticos em `src/styles.css` para fundos, bordas e ícones de concluído, cancelado e arquivado, incluindo tema escuro.
- Adaptar `job-list-view.tsx`, `job-task-row.tsx` e os cards de quadro em `jobs-panel.tsx`; passar os dados de arquivamento e status já disponíveis.
- Cobrir em testes a classificação, a precedência entre estados, a presença dos tons nas quatro apresentações e a preservação das ações.

## MASTER-first e validação
- Regenerar o pacote MASTER e sincronizar a nova versão entre o delta e o contrato de instalação.
- Como não haverá estrutura nova de banco, não será necessária nova checagem estrutural no instalador.
- Rodar testes focados, verificação de tipos, integridade das alterações, `bun run master:check` e conferir o build do preview.
- Não publicar nem propagar para instalações sem autorização explícita.
