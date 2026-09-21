# Resolver definitivamente o cron 37 no Master 1.4.20

## Estado confirmado

- O cron 37 está inativo.
- O freeze global está desligado, na geração 0.
- A recovery canônica `20260919143000` não consta no ledger remoto.
- `control_plane_release_state`, `control_plane_release_events` e a RPC de promoção ainda não existem no banco remoto.
- As credenciais e autorizações auditáveis exigidas pelos scripts não estão presentes neste executor. Nenhuma ação remota pode começar até que sejam injetadas pelo cofre seguro do terminal administrativo.

## Sequência de execução

1. **Validar o executor protegido**
   - Confirmar somente presença, formato e vínculo das variáveis ao Master `tkjbhttylouamqxnbfgv`, sem imprimir segredos.
   - Confirmar o contrato local 1.4.20, hashes selados, Supabase CLI 2.117.0 e arquivos JSONL persistentes.
   - Parar imediatamente se qualquer credencial, autorização independente ou vínculo estiver ausente/divergente.

2. **Aplicar o freeze global**
   - Registrar a aceitação formal de risco sem backup restaurável.
   - Executar o freeze pelo script canônico corrigido.
   - Confirmar no banco que o freeze está ativo e que a Apex permaneceu intacta.

3. **Executar o preflight e a recovery canônica**
   - Rodar o relatório remoto completo e exigir 17/17 verificações aprovadas.
   - Executar exclusivamente `20260919143000_recover_missing_legacy_reconciliation.sql` pelo executor oficial.
   - Confirmar hashes, seleção única da migration e ledger final esperado, sem inventar a migration histórica ausente.

4. **Instalar e promover o contrato do Control-plane**
   - Instalar, sob freeze, apenas os objetos de release ausentes usando baseline explícito e verificado.
   - Promover atomicamente para 1.4.20 com geração esperada, commit e SHA-256 selados.
   - Confirmar `current_version`, `pinned_release`, `pinned_commit_sha`, hash e evento de promoção.

5. **Descongelar e ativar exclusivamente o cron 37**
   - Desligar o freeze pelo ato autorizado próprio.
   - Executar o script canônico de ativação, que exige recovery registrada, release 1.4.20 promovida e ausência de atividade concorrente.
   - Confirmar que apenas o job 37 mudou para ativo e registrar a auditoria JSONL.

6. **Validar a retomada da Apex**
   - Observar a operação existente sem claim manual, edição, cancelamento ou recriação.
   - Confirmar que o executor durável a reivindicou naturalmente, com incremento de fencing e início das etapas, ou registrar o primeiro bloqueio real.
   - Confirmar que `unitos-new-teste-02.vercel.app` permanece acessível.

## Proteções obrigatórias

- Parar no primeiro bloqueio real.
- Não executar atalhos, SQL avulso de mutação ou claim manual.
- Preservar RBAC, RLS, grants, locks, transações, freeze, fencing, hashes e autorizações independentes.
- Não alterar diretamente a operação Apex.
- Não publicar código nem iniciar auditoria geral.

## Dependência externa

Antes da execução, o operador deve disponibilizar no cofre do terminal administrativo todas as variáveis já definidas pelos scripts para conexão, risco, freeze, recovery, instalação do release, promoção, unfreeze e cron. Enquanto continuarem ausentes, a execução permanecerá bloqueada sem mudança remota.
