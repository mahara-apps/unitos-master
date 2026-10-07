# Alertas de crédito e orçamento das IAs

## Objetivo
Avisar claramente quando um provedor de IA ficar sem créditos e antecipar o consumo do orçamento mensal configurado no Unitos, mantendo o design atual e o isolamento entre workspaces.

**Distinção obrigatória:** consumo registrado no Unitos não é saldo da conta OpenAI, Anthropic, Gemini ou Groq. Não mostrar saldo estimado nem prometer consulta automática de saldo sem integração oficial verificada.

## Situação confirmada no código
- `ai-failures.server.ts` agrupa crédito/quota na categoria `provider_quota`, marcada como retentável; a mensagem atual recomenda tentar mais tarde. A checagem genérica de HTTP 400 vem antes da identificação de crédito, podendo esconder erros de saldo retornados nesse status.
- `connections.functions.ts` já expõe orçamento mensal e consumo registrado, inclusive por provedor. O período atual usa início do mês em UTC.
- Existem verificação das conexões, notificações e acompanhamento dos trabalhos de IA; esses caminhos serão reaproveitados, não substituídos por um sistema paralelo.

## Fase 1 — Falta de crédito com aviso correto
1. Separar falta de crédito comprovada, orçamento/limite financeiro do provedor e excesso temporário de solicitações. Não considerar todo HTTP 400, 403 ou 429 falta de saldo; interpretar códigos e mensagens conhecidos, preservando negativas de acesso como categoria distinta.
2. Quando houver falta de crédito confirmada, mostrar no trabalho afetado: **“Créditos insuficientes na Anthropic. Solicite ao administrador a reposição do saldo para continuar.”** O nome acompanha o provedor real, inclusive Groq quando for o fallback afetado.
3. Manter aviso persistente em Conexões e notificar Owner/Admin do workspace, sem repetir a notificação a cada tentativa. Usuários operacionais veem o motivo do impedimento, sem acesso a chaves ou detalhes financeiros restritos.
4. Registrar o estado financeiro por workspace/provedor no servidor e impedir novas tentativas automáticas nesse provedor enquanto estiver bloqueado. Não bloquear outros workspaces ou provedores saudáveis, nem alterar permissões ou a regra de fallback para outras categorias de erro. Se uma operação continuar por um caminho já autorizado, mostrar o aviso sem marcá-la falsamente como falha.
5. Após reposição, um administrador usa **“Verificar disponibilidade”**. Listar modelos ou validar a chave não comprova crédito: a recuperação exige evidência de capacidade de geração; se necessária, uma chamada mínima explícita pode consumir créditos. Só depois liberar novos pedidos e a retomada autorizada, sem replay dos trabalhos antigos nem perda de resultados parciais.

**Aceite:** erro real de saldo, inclusive Anthropic retornando HTTP 400, gera aviso correto; não provoca retentativas automáticas repetidas; não confunde chave inválida, negativa de acesso ou rate limit com falta de crédito.

## Fase 2 — Aviso antecipado por gasto mensal
1. Reaproveitar o orçamento mensal configurado em Conexões; ele continua sendo referência de gasto, não saldo nem bloqueio automático.
2. Propor faixas iniciais ajustáveis pelos administradores: **80% — atenção**, **95% — próximo do orçamento**, **100% — orçamento atingido**. Atingir essas faixas apenas avisa; não interrompe a operação.
3. Exibir consumo registrado versus orçamento e a faixa atual em Conexões, com resumos numéricos em `PageKpi`/`PageKpiGrid`. Nomear valores como consumo registrado/estimado conforme a fonte, nunca saldo do provedor.
4. Avaliar as faixas após registrar consumo, no servidor, mesmo com a página fechada. Notificar Owner/Admin uma vez por faixa e mês; alterações de orçamento devem recalcular o estado sem inundar as notificações.
5. Calcular o mês em `America/Sao_Paulo`, usando o utilitário oficial. Orçamento zero fica como “sem orçamento definido”, sem divisão por zero ou falso aviso; informar a data da última atualização e não tratar falha de leitura como consumo zero.

**Aceite:** valores limítrofes corretos; avisos sem duplicação sob concorrência; virada de mês correta; estimativa do Unitos nunca apresentada como saldo real.

## Detalhes técnicos e segurança
- Contrato compartilhado de erro e estado financeiro, aplicado aos caminhos de geração de texto/imagem, estratégia, briefing/documentos, pautas, peças e chat que utilizem os provedores diretos. Inventariar os chamadores antes de alterar o tratamento.
- Persistência aditiva e idempotente para bloqueio financeiro e deduplicação dos alertas, com escopo explícito de workspace/provedor/período. Manter RBAC, RLS, auth, lease/fencing e efeitos idempotentes dos jobs.
- Novas tabelas, se necessárias, recebem GRANT explícito, RLS e revogação de privilégios perigosos de anon/PUBLIC na mesma migração. Autoridade administrativa validada no servidor; nenhuma chave ou resposta sensível vai para avisos.
- Sem adicionar Lovable AI Gateway, trocar provedores/modelos, alterar cadência dos trabalhos ou gerar consultas pagas de saldo em segundo plano. Sem inventar avisos de saldo em cabeçalhos não documentados.

## Entrega MASTER-first e validação
Executar as fases em sequência, validando a primeira antes de iniciar a segunda, sem expandir o plano Asana.

Para cada entrega: alteração no MASTER → testes de classificação, isolamento, concorrência, recuperação e UI → regenerar `build_delta.py` → sincronizar SHA e nova versão em `delta_version.txt` e `MASTER_RELEASE_VERSION` → atualizar `verify-installation.sql` e checagem 80 quando aplicável → `bun run master:check` → suíte global sem relaxar testes ou timeouts e verificação da aplicação.

Cobrir explicitamente falta de crédito, quota financeira, rate limit, credencial inválida, acesso negado, dois workspaces, fallback indisponível, restauração autorizada, mês GMT-3, orçamento zero e notificações duplicadas. Usar respostas controladas para falhas financeiras, sem gastar em repetidas chamadas a contas bloqueadas.

**Publicação do MASTER e atualização da Casa 8 continuam dependendo de autorização explícita. Esta entrega cria os avisos; não repõe o saldo das contas de IA.**