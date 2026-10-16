# Correção: verificação de limite de IA falhando sem usuário/cliente

## Problema confirmado
Quando a geração roda em segundo plano (sem pessoa logada) ou sem cliente definido, a verificação de limite mensal de IA quebra internamente quando o workspace não tem limite cadastrado. O sistema entende isso como "não foi possível confirmar os limites" e bloqueia a geração (caso da Casa 8 hoje, peças da LUNY7).

## O que será feito
1. Corrigir a verificação de limite para tratar "sem limite cadastrado" como "sem teto" em todos os níveis (workspace, cliente, usuário), sem erro.
2. Chamadas de sistema (sem pessoa logada, feitas pelo servidor) passam a ser aceitas; pessoas logadas continuam precisando ser membros do workspace.
3. Limites existentes continuam bloqueando normalmente quando ultrapassados. Falha real de comunicação continua bloqueando (fail-closed mantido).
4. Peças que falharam por esse motivo: basta clicar em "Refazer" após a atualização. Nada é apagado.

## Detalhes técnicos
- Nova migração com `CREATE OR REPLACE FUNCTION public.check_ai_usage_budget(...)`: substituir `record` + `SELECT INTO` por variáveis escalares (`numeric`) inicializadas em NULL; ramos de cliente/usuário só avaliados quando o parâmetro não é nulo; autorização: `auth.uid()` membro do workspace OU `auth.role() = 'service_role'`. Manter SECURITY DEFINER, `search_path = public`, mesmo contrato jsonb `{allowed, blocked_by, spent_usd, limit_usd}` e mesmos GRANTs (revogar anon).
- Teste unitário em `tests/` cobrindo, no delta: ausência de acesso a `.limit_usd` de record não atribuído e presença do ramo service_role.
- Teste SQL no MASTER: marca sem limites + `_user_id`/`_client_id` nulos → `allowed=true`; com limite excedido → `allowed=false`.
- MASTER-first: `build_delta.py`, `delta_version.txt` + `MASTER_RELEASE_VERSION` = 1.4.78, regenerar bootstrap/contrato do control-plane, `verify-installation.sql` checando a nova assinatura/comportamento, `bun run master:check`, suíte local.
- Publicação e "Autorizar nova atualização" na Casa 8 só com sua autorização (levará juntas 1.4.76 chaves e 1.4.77 carrossel).
