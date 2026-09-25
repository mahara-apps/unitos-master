# Auditoria e correção da área de Tarefas no MASTER

## Objetivo
Fazer contadores, filtros e resultados concordarem em Minhas tarefas, lista, quadros, linha do tempo e calendário, sem mudar RBAC/RLS/auth nem criar rotas ou campos no banco sem necessidade. Propagar a correção pelo processo MASTER-first; não publicar nem atualizar instalações sem autorização explícita.

## O que a análise já confirmou
- A página busca tarefas para o cliente ativo nas visões comuns, mas Minhas tarefas busca todos os clientes acessíveis e aplica responsável no servidor. Assim, o número “Minhas” muda de universo conforme a visão.
- A busca tem teto de 500 tarefas antes dos filtros locais; resultados fora desse recorte podem desaparecer, mesmo quando correspondem ao filtro. O rodapé apresenta o tamanho do recorte como se fosse o total.
- Filtros operacionais vivem só na página e se perdem ao recarregar/compartilhar o endereço; busca, ordenação, agrupamento e visão vivem no endereço. A linha do tempo e o calendário não exibem tarefas sem data no mês visível, embora o rodapé conte todas as filtradas.
- A página trata carregamento, mas não distingue erro de busca de lista vazia. As imagens com contadores e lista aparentemente contraditórios exigem reprodução autenticada e conferência das respostas antes de atribuir uma causa única; não presumir que seja apenas filtro.
- Ordenação é aplicada na tabela, não de modo uniforme aos demais resultados; calendário limita a três tarefas visíveis por dia. Os filtros de data e os indicadores “Hoje” usam o relógio local, enquanto o fuso oficial do sistema é Brasília.

## Plano de execução
1. **Diagnóstico reproduzível:** testar com sessão autorizada no MASTER e em instalação de teste, registrar endereço, cliente ativo, filtros, respostas e dados daquelas tarefas, e comparar contadores, barra lateral e resultados em cada visão. Separar defeito real de diferença intencional de escopo. Se a autenticação do ambiente de teste não estiver disponível, não afirmar que os fluxos reais foram testados.
2. **Um conjunto coerente de resultados:** unificar a interpretação de escopo, filtros e contadores; explicitar quando “Minhas tarefas” abrange todos os clientes acessíveis e evitar trocar silenciosamente o universo dos indicadores. Aplicar filtros antes da paginação/limite onde necessário, com contagem verdadeira e navegação para conjuntos maiores; preservar o acesso sujeito às regras existentes. Distinguir erro, carregamento, ausência de dados e nenhum resultado filtrado.
3. **Mesmos critérios entre visões:** manter filtros no endereço, inclusive ao alternar lista/quadros/calendário/linha do tempo, com ordenação coerente dos itens. Ajustar rodapé e estados das visões com mês visível; tornar acessíveis tarefas adicionais no mesmo dia. Alinhar “Hoje”, atrasos e período semanal ao fuso oficial, sem mudar datas armazenadas.
4. **Fluxos e regressões:** verificar abrir/criar/editar tarefa, trocar responsável/status, arrastar entre colunas, selecionar, exportar, alternar cliente, arquivar, abrir peça vinculada e navegar pelos meses. Cobrir por testes automatizados escopo, filtros combinados, >500 registros, contagens, fuso, vazios/erros, ordenação e atualizações após alterações. Executar testes de interação nas visões para desktop e celular onde o acesso permitir.
5. **MASTER-first:** aplicar ajustes no MASTER; regenerar o delta; sincronizar versão e SHA no pacote e no código; revisar o verificador da instalação (sem criar checagens de banco para mudanças apenas de interface); rodar `bun run master:check` e a suíte global sem aumentar timeout, pular testes ou mascarar falhas. Não publicar se validações essenciais estiverem bloqueadas; reportar exatamente o impedimento. Após validação, solicitar autorização explícita antes de publicar e atualizar as instalações em etapas, conferindo cada uma.

## Limites técnicos
Reutilizar as funções, componentes e estrutura existentes; evitar migration se não houver necessidade comprovada. Não alterar políticas de acesso, privilégios ou autenticação. Não usar Cloud AI quando há provedores diretos disponíveis. A publicação e propagação são etapas separadas, dependentes de autorização.
