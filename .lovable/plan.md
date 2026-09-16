# Retry seguro de provisionamento terminal

## Objetivo
Permitir uma nova tentativa somente quando o último provisionamento terminou em `failed`, não há operação ativa e nunca houve provisionamento concluído. A tentativa será uma nova operação durável ligada à operação anterior, sem mudar a semântica de UPDATE ou reabrir o histórico antigo.

## Implementação
1. **Regra explícita de elegibilidade**
   - Manter `ALLOWED_START.provision` inalterado para provisionamentos normais.
   - Adicionar uma regra contextual para retry terminal que aceite `error` ou, excepcionalmente, `update_available` quando:
     - a última operação `provision` está `failed`;
     - não há operação `pending`, `running` ou `retryable`;
     - `last_provisioned_at` está vazio;
     - não existe operação `provision` concluída com sucesso.
   - Usar a mesma regra na interface e no servidor.

2. **Criação atômica e histórico**
   - Passar o ID da operação falha como origem do retry.
   - Estender `start_durable_installation_operation` para validar novamente, sob lock da instalação, que a origem pertence à instalação, é o último `provision`, está `failed`, não existe provisionamento bem-sucedido e não existe operação ativa.
   - Criar uma nova UUID e registrar em `detail` a relação `retryOfOperationId` e o motivo do retry.
   - Não atualizar, reabrir ou apagar a operação anterior.

3. **Execução existente preservada**
   - Reutilizar `openAutomatedProvision` e o executor atual, mantendo MASTER vigente, checkpoints por nova operação, lease, fencing, retries limitados e validações de Super Admin/confirmação.
   - Preservar as regras atuais de adoção: Supabase nunca é criado pelo fluxo; GitHub/Vercel existentes só são adotados quando válidos e conflitos continuam bloqueando.
   - Não executar provisionamento real nem acessar recursos externos durante os testes.

4. **Interface**
   - Habilitar “Tentar novamente” somente com a elegibilidade contextual acima.
   - Continuar bloqueando provisionamento normal em `update_available` e qualquer tentativa com operação ativa ou provisionamento já concluído.

5. **MASTER-first**
   - Criar migration para a RPC durável atualizada.
   - Regenerar o pacote com `build_delta.py`.
   - Subir `delta_version.txt` e `MASTER_RELEASE_VERSION` para a mesma nova versão.
   - Manter `verify-installation.sql` cobrindo a RPC e atualizar os testes de sincronização/fixtures necessários.
   - Não publicar.

## Testes
- Cobrir obrigatoriamente:
  1. `failed + update_available + sem active_op` permite retry;
  2. `failed + error` permite retry;
  3. operação ativa bloqueia;
  4. provisionamento concluído bloqueia;
  5. `update_available` sem `provision failed` continua bloqueado;
  6. nova tentativa cria outro `operation_id`;
  7. operação anterior permanece imutável;
  8. replay concorrente/idempotência não duplica operação e adoção existente permanece contratualmente protegida;
  9. lock, lease e fencing permanecem válidos;
  10. UPDATE mantém a regra atual.
- Executar testes focados de instalações, suíte global, `tsgo --noEmit`, lint, build e `bun run master:check`.

## Limites
- Nenhum NEW/provisionamento real.
- Nenhuma alteração em Taveira, `unitos-new-teste-02`, bancos externos, GitHub, Vercel ou Secrets.
- Nenhuma publicação.
