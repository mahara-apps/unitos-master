# Modelos de projeto reutilizáveis — MASTER e instalações

## Resultado para o usuário

Em **Projetos**, oferecer **Modelos de projeto** e dois caminhos: **Criar do zero** e **Salvar projeto existente como modelo**. Um modelo mantém a estrutura projeto → jobs → tarefas, sua ordem, descrições, prioridades, estimativas de tempo, responsável e envolvidos elegíveis. Ao criar um projeto a partir dele, o usuário revisa nome, cliente, pessoas e conteúdo antes de confirmar. O projeto de origem nunca é modificado.

## Experiência

1. Adicionar uma área própria de modelos, acessível em Projetos e na opção “A partir de modelo”, para listar, visualizar, criar, editar, duplicar e arquivar modelos do workspace. Modelos do sistema permanecem somente leitura; cópias do workspace são editáveis.
2. No editor, permitir montar e reordenar jobs e tarefas do zero ou importar a estrutura de um projeto acessível. Mostrar contagem, responsáveis e tempo **estimado**, com prévia antes de salvar.
3. Na importação de um projeto existente, mostrar comentários e briefings acessíveis por nível (projeto, job e tarefa). **Nada fica selecionado por padrão.** O usuário marca cada trecho que deseja reutilizar, pode editar seu texto e escolhe onde ficará como conteúdo padrão. Não levar autor, data, menções, anexos nem histórico da conversa; textos selecionados só aparecem na nova instância nos locais confirmados na prévia.
4. Ao instanciar, mostrar revisão final com destino, participantes/responsáveis e textos padrão. Validar de novo o acesso de cada pessoa ao cliente escolhido. Pessoas inelegíveis ficam sem atribuição, com pendência visível para escolha antes de criar; nunca obter acesso por meio do modelo.
5. Não copiar datas de início/prazo/publicação, tempo efetivamente registrado, timer em andamento, progresso, status de concluído, arquivamento, notificações, pautas ou peças vinculadas ao projeto de origem. Preservar somente estimativas; o novo projeto começa ativo e as tarefas começam abertas.

## Implementação e segurança

- Reutilizar as tabelas e o fluxo de modelos existentes, ampliando-os de modo aditivo para responsáveis, envolvidos, estimativas de jobs e textos padrão selecionados. Usar identificadores estáveis para mapear jobs/tarefas ao instanciar, inclusive nomes repetidos; manter modelos legados e do sistema funcionais.
- Implementar captura, edição e instanciação em operações transacionais no banco, sem projeto parcial em caso de falha. Restringir leitura e escrita ao workspace e ao escopo de cliente/projeto do ator; aplicar as regras existentes de RBAC/RLS também dentro das rotinas privilegiadas. Não copiar conteúdo de origem inacessível e não permitir seleção forjada de comentários/briefings. Fazer leituras críticas falharem explicitamente, nunca tratar erro como lista vazia.
- Criar as páginas e ações usando os componentes e padrões atuais, com estados distintos de carregamento, vazio e erro. Utilizar as funções autenticadas existentes e `callRpc` para RPCs; não expor dados de outros clientes nem criar papéis novos. Metadados próprios nas novas páginas.
- Testar criação do zero, captura de projeto, edição e arquivamento, modelo legado, nomes repetidos, seleção zero/alguns textos, escopo cruzado, mudança de acesso do responsável, limite/paginação, perda de resposta e repetição da operação sem duplicar projetos. Ensaiar também a criação completa a partir do modelo e confirmar que nenhum dado de execução foi copiado.

## Entrega MASTER-first e propagação controlada

1. Aplicar código e migration **primeiro no MASTER**; preservar dados e operações atuais. Conferir grants/RLS das tabelas novas e compatibilidade das instalações ainda em versões anteriores.
2. Regenerar o delta com `build_delta.py`, registrar o SHA impresso e elevar `delta_version.txt` e `MASTER_RELEASE_VERSION` para a mesma **nova versão**. Atualizar a verificação de instalação para novos objetos/campos e os contratos de release gerados aplicáveis; resolver qualquer arquivo/verificação ausente antes de considerar o pacote pronto.
3. Rodar testes focados, ensaio transacional, typecheck, suíte global sem relaxar testes ou timeout, `bun run master:check` e verificação de pacote/versão. Documentar falhas e bloqueadores sem declarar liberação prematura.
4. Apresentar evidências, versão e SHA; **pedir autorização explícita para publicar o MASTER**. Publicar somente após essa autorização e confirmar o estado publicado; não equiparar prévia à produção.
5. **Pedir autorização separada para atualizar instalações.** Fazer preflight somente leitura por destino, confirmar estado/versão/operação/ledger e selecionar uma instalação de teste sem interferir em operações ativas ou filas congeladas. Atualizar via mecanismo oficial, acompanhar até validação final e conferir modelo → projeto/escopo/ausência de duplicatas no destino.
6. Só após aprovação da instalação de teste, atualizar as demais **individualmente**, com verificação antes/depois, sem presumir que publicar o MASTER as atualiza automaticamente. Manter bloqueada qualquer instalação cuja validação, acesso ou operação ativa impeça atualização segura; relatar o bloqueio em vez de forçar retomada.

**Fora de escopo:** publicação ou atualização automática antes das autorizações, alteração do RBAC/RLS geral, migração de conteúdo histórico de projetos antigos e cópia de horas realmente trabalhadas.
