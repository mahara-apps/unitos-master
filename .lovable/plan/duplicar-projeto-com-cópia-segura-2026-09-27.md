# Duplicar projeto com cópia segura

## Resultado para o usuário

Adicionar **Duplicar projeto** ao menu de ações mostrado na referência, entre **Configurações do projeto** e **Arquivar**. A cópia será criada no mesmo cliente e aberta automaticamente, com o nome `COPIA - {nome atual}`.

## O que será copiado

- Dados editáveis do projeto: cliente, descrição, objetivos, cor, responsável, envolvidos e datas.
- Estrutura completa e ordenação de jobs e tarefas.
- Descrições, responsáveis elegíveis, prioridades, estimativas e datas de jobs e tarefas.
- Responsáveis e envolvidos serão revalidados contra o acesso atual ao cliente; quem perdeu acesso ficará sem atribuição, sem receber acesso automaticamente.

## O que não será copiado

- Pauta mensal, peças, posts ou outros vínculos editoriais do projeto original.
- Comentários, menções, anexos e notificações.
- Horas registradas, timers em andamento e demais histórico de execução.
- Progresso, conclusões e arquivamento. A cópia começa ativa, com jobs e tarefas abertos.

## Fluxo e segurança

1. Exibir uma confirmação curta informando o novo nome e resumindo o que não será levado.
2. Executar a duplicação em uma única operação transacional: qualquer falha desfaz toda a cópia, sem projeto parcial.
3. Aplicar o mesmo acesso do projeto original e as regras atuais de cliente, workspace e responsáveis; a operação não concede novas permissões.
4. Tornar a ação resistente a clique duplo e perda de resposta, evitando cópias duplicadas da mesma solicitação.
5. Ao concluir, mostrar confirmação e abrir o novo projeto; em falha, manter o usuário no original com mensagem clara.

## Detalhes técnicos

- Criar uma operação autenticada específica para duplicar projeto, usando a validação canônica de acesso ao projeto e identificadores estáveis para relacionar jobs e tarefas com suas novas cópias.
- Inserir a ação nas duas variações do menu da tela do projeto, mantendo o comportamento consistente em telas grandes e pequenas.
- Cobrir projeto sem jobs, nomes repetidos, múltiplos jobs/tarefas, responsáveis inelegíveis, perda de resposta, repetição da solicitação e rollback transacional.
- Verificar explicitamente que pauta/peças, comentários, horas, progresso, conclusões e arquivamento não foram transportados.

## Entrega junto aos modelos de projeto

1. Implementar no MASTER junto ao pacote já planejado de modelos reutilizáveis, sem misturar a duplicação direta com a criação de modelo.
2. Regenerar o delta, elevar `delta_version.txt` e `MASTER_RELEASE_VERSION` para a mesma nova versão, atualizar a verificação de instalação e os contratos aplicáveis.
3. Rodar testes focados, ensaio transacional, TypeScript, suíte global sem relaxar critérios e `bun run master:check`.
4. Apresentar versão, SHA e evidências; publicar o MASTER somente após autorização explícita.
5. Pedir autorização separada para atualizar uma instalação de teste e, após validação, cada instalação restante individualmente.

**Fora de escopo:** copiar histórico, pauta/peças ou conceder acesso; publicar ou atualizar instalações sem autorização específica.
