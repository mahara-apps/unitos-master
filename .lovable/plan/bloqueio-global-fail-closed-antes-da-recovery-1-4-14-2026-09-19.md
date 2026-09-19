# Bloqueio global fail-closed antes da recovery 1.4.14

## Objetivo

Criar localmente um congelamento global, auditável e transacional no MASTER. Nenhum backup, congelamento remoto, migration remota, recovery, UPDATE, NEW, retry, P0, publicação ou deploy será executado nesta etapa.

## Implementação

1. Adicionar uma migration exclusiva do Control-plane com um singleton de congelamento, grants/RLS e RPCs restritas para consultar e alternar o estado.
2. Serializar ativação/desativação e mutações operacionais com advisory locks compatíveis; ativar o congelamento somente quando não houver operação ou tentativa ativa.
3. Instalar triggers fail-closed sobre as tabelas do Installation Manager para rejeitar criação, retomada, checkpoint, finalização ou alteração enquanto congelado, inclusive chamadas diretas com `service_role`.
4. Adicionar guardas explícitos nos pontos de entrada do aplicativo, cron e rotas públicas para falhar cedo e com resposta clara; o banco continuará sendo a autoridade final.
5. Exigir congelamento ativo no preflight e na própria recovery 1.4.14, preservando sua seleção exclusiva e todas as verificações existentes.
6. Criar ferramenta operacional local para `status`, `freeze` e `unfreeze`, com identidade exata do MASTER, confirmação explícita, verificação de quiescência e evidência sem secrets.
7. Atualizar o verificador MASTER e a documentação do procedimento de backup/congelamento.

## MASTER-first e validação

- Classificar a migration como `control-plane`, nunca Client.
- Regenerar bootstrap MASTER e delta Client; manter o conteúdo/SHA do pacote Client inalterado.
- Atualizar `delta_version.txt` e `MASTER_RELEASE_VERSION` para a mesma nova versão.
- Cobrir tabela, RPCs, triggers, grants, RLS, concorrência e bloqueios em testes.
- Executar testes focados, ensaio PostgreSQL isolado, `master:check`, typecheck e lint alterado.
- Conferir os logs do build automático e o diff final.

## Critérios de segurança

- Estado ausente, ilegível ou inválido bloqueia mutações operacionais.
- O congelamento não pode ser ativado com operações/tentativas ativas.
- Nenhuma operação pode começar entre a verificação de quiescência e a ativação.
- A recovery aborta se o congelamento não estiver ativo.
- Descongelar será uma ação independente; não autoriza UPDATE da Apex.
