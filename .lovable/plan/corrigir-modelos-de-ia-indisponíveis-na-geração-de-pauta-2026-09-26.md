# Corrigir modelos de IA indisponíveis na geração de pauta

## Diagnóstico confirmado

Na instalação NXT, as chaves não estão ausentes:

- Gemini está conectado e validado, com 61 modelos disponíveis.
- Groq está conectado e validado, com 11 modelos disponíveis.
- O cadastro ainda mantém **OpenAI** como provedor principal, embora não exista chave OpenAI ativa.
- Groq está cadastrado como fallback; Gemini está conectado, mas fica fora do seletor porque a listagem atual considera somente os campos “principal” e “fallback”.
- O executor da geração e o seletor usam regras diferentes: o executor pode aproveitar outra conexão ativa, enquanto o seletor limita a lista ao principal/fallback.
- Se a consulta falhar, a tela não mostra o erro; permanece apenas com “Modelo configurado”, igual a uma lista vazia.

## Correção

1. **Unificar a regra de disponibilidade**
   - Criar uma resolução canônica dos provedores de texto utilizáveis pelo workspace.
   - Considerar somente conexões com chave presente, estado conectado e capacidade de texto.
   - Ordenar por: principal ativo, fallback ativo e demais conexões ativas.
   - Usar essa mesma regra no seletor e na geração, eliminando a divergência atual.

2. **Corrigir o seletor da pauta**
   - Exibir Gemini e Groq quando ambos estiverem ativos, mesmo que o campo principal ainda aponte para um provedor desconectado.
   - Pré-selecionar o primeiro provedor realmente utilizável.
   - Atualizar a lista sempre que o painel for aberto, evitando resultado vazio em cache após salvar ou testar uma chave.
   - Não alterar silenciosamente a preferência principal cadastrada.

3. **Mostrar estados claros**
   - Exibir carregamento, erro de consulta e ausência real de conexões como estados distintos.
   - Em erro, apresentar a mensagem segura e uma ação para tentar novamente.
   - Quando não houver modelo utilizável, orientar a revisar as conexões em vez de deixar o campo vazio.
   - Impedir o avanço somente quando nenhum modelo utilizável estiver disponível.

4. **Preservar segurança e escopo**
   - Manter autenticação, RBAC e RLS atuais.
   - Não expor nem mover chaves; a leitura dos segredos continua exclusivamente no servidor.
   - Não trocar provedor, chave ou modelo configurado sem ação explícita do usuário.

## Validação

- Cobrir com testes: principal ativo; principal desconectado com fallback ativo; terceiro provedor ativo; nenhuma conexão; erro de permissão/consulta; reabertura após atualização da conexão.
- Confirmar que o modelo escolhido pelo seletor é aceito pelo executor com a mesma regra canônica.
- Validar na NXT que Gemini e Groq aparecem e que uma geração pode iniciar com o modelo selecionado.
- Executar testes direcionados, suíte global, typecheck e build sem aumentar timeout, pular testes ou mascarar falhas.

## Entrega MASTER-first

- Aplicar a correção no MASTER.
- Regenerar o pacote com `build_delta.py`.
- Sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION`.
- Atualizar `verify-installation.sql` somente se surgir requisito estrutural; a correção prevista é de código e testes.
- Executar `bun run master:check`.
- Não publicar nem propagar para a NXT sem autorização explícita separada.

## Fora de escopo

Sem migration prevista, sem alteração de chaves, RBAC, RLS, autenticação, clientes, dados de pauta ou preferências de provedor já cadastradas.
