# Gestão administrativa de modelos de projeto

## Diagnóstico confirmado

- A área existe em **`/projects/models`**, mas hoje mistura listagem e um formulário longo na mesma página, com estrutura linear, pouca hierarquia visual e ações dispersas.
- A tela oferece criar, editar, duplicar e arquivar, mas **não oferece exclusão definitiva** nem uma visão específica de arquivados.
- A interface atual não bloqueia a gestão por nível administrativo.
- As regras atuais do banco são mais amplas que a hierarquia escolhida: há caminhos de escrita para Manager/User e exclusão baseada apenas em participação no workspace. Isso precisa ser fechado no servidor e no banco, não apenas escondido na tela.

## Hierarquia definida

- **Super Admin, Owner e Admin:** criar, editar, duplicar, arquivar, restaurar e excluir modelos do workspace.
- **Manager e User:** visualizar modelos disponíveis e criar projetos a partir deles; não acessam ações administrativas.
- **Cliente do Portal:** sem acesso à gestão de modelos.
- **Modelos do sistema:** somente leitura no workspace; podem ser duplicados para virar um modelo editável próprio.

A mesma regra será aplicada na tela, nas funções do servidor, nas RPCs e nas políticas RLS. A autorização canônica continuará vindo do papel do workspace; nenhum ID enviado pelo navegador concederá permissão.

## Nova experiência

### 1. Lista administrativa em `/projects/models`

Substituir a página seca por uma lista alinhada ao padrão administrativo do sistema:

- cabeçalho com **Novo modelo** e retorno para Projetos;
- busca por nome e filtros **Ativos / Arquivados / Sistema**;
- linhas com nome, descrição curta, origem, quantidade de jobs e tarefas, situação e última atualização;
- menu de ações por linha: **Editar, Duplicar, Arquivar/Restaurar e Excluir**;
- estados consistentes de carregamento, vazio, erro e ausência de permissão;
- Manager/User veem uma versão somente leitura, sem ações administrativas.

### 2. Editor dedicado

Usar uma página de edição própria, sem comprimir uma estrutura grande dentro da listagem:

- **`/projects/models/new`** para criar do zero ou importar um projeto existente;
- **`/projects/models/$templateId`** para editar;
- cabeçalho fixo com nome do modelo, estado de salvamento, **Cancelar** e **Salvar**;
- organização em blocos claros:
  1. Informações do modelo;
  2. Estrutura de jobs e tarefas;
  3. Responsáveis e participantes;
  4. Textos padrão selecionados;
  5. Revisão final;
- jobs recolhíveis, tarefas com ordem clara e ações por menu, reduzindo poluição de ícones;
- resumo lateral ou faixa de revisão com totais, pessoas sem acesso e conteúdo que não será copiado;
- aviso ao sair com alterações não salvas;
- validação por seção e foco automático no primeiro erro.

### 3. Salvar com segurança

- Preservar criação do zero e captura de projeto existente.
- Manter a seleção explícita dos textos; nada entra automaticamente.
- Revalidar no salvamento a origem dos textos, o workspace, o cliente e as pessoas envolvidas.
- Salvar de modo transacional: falha em qualquer parte não deixa modelo parcial.
- Impedir edição de modelos do sistema e impedir que duas tentativas rápidas criem cópias acidentais.

### 4. Arquivar, restaurar e excluir

- **Arquivar** continua sendo a ação reversível e remove o modelo das escolhas normais.
- A aba **Arquivados** permite restaurar ou excluir.
- **Excluir** fica disponível para Super Admin, Owner e Admin, conforme definido.
- Exigir diálogo com resumo do impacto e digitação do nome exato do modelo.
- Modelos do sistema nunca podem ser excluídos.
- Projetos já criados permanecem intactos. Antes da implementação, mapear referências internas e preservar registros necessários de auditoria; se uma referência impedir exclusão segura, a tela orientará arquivar em vez de apagar parcialmente.

## Implementação técnica

- Criar uma autorização canônica de gestão de modelos reutilizada pela interface e pelo servidor.
- Restringir `save_project_template`, arquivar/restaurar/excluir e as políticas das tabelas de modelos a Super Admin/Owner/Admin.
- Adicionar operações transacionais de restauração e exclusão, com privilégios explícitos e proteção contra acesso entre workspaces.
- Manter leitura/uso de modelos conforme o escopo atual do usuário e do cliente.
- Separar listagem e editor em componentes focados, reutilizando botões, diálogos, menus, campos e superfícies do design system existente.

## Validação e segurança

- Testar a matriz completa: Super Admin, Owner, Admin, Manager, User e Portal.
- Confirmar que Manager/User não conseguem escrever nem chamando a função diretamente.
- Testar criação, edição, duplicação, arquivamento, restauração, exclusão, modelo do sistema, tentativa entre workspaces e falha transacional.
- Testar alterações não salvas, validações, lista vazia, erro, busca/filtros e visualização em desktop e celular.
- Confirmar que excluir um modelo não altera projetos já instanciados.

## Entrega MASTER-first

1. Implementar código e migrações no MASTER.
2. Atualizar a verificação de instalação para cobrir permissões e novas operações.
3. Regenerar o delta, alinhar SHA e versão do MASTER.
4. Rodar testes focados, suíte global sem relaxamentos e `bun run master:check`.
5. Solicitar autorização explícita para publicar o MASTER.
6. Depois, solicitar autorização separada para atualizar uma instalação de teste e, após validação, as demais instalações.

Nada será publicado nem propagado sem essas autorizações separadas.
