# Recuperação segura da fila múltipla 1.4.43

## Diagnóstico confirmado

- A remessa `261f5362-5afd-4856-b9d3-80d88362cf7f` tem cinco instalações: NXT concluiu e Casa 8, Apex, Taveira e unitos-new-teste-02 permanecem `pending`, sem tentativa iniciada.
- O cron está saudável, executando a cada minuto, mas retorna `claimed: 0`. Portanto, não é falha do agendador nem indisponibilidade das instalações.
- O bloqueio acontece no gate sequencial: a Casa 8 só pode iniciar quando a operação anterior estiver `success`, com `reconciled_at` preenchido e `pinned_release`/`pinned_commit_sha` iguais ao pacote selado.
- A NXT terminou com `status=success`, 93 migrations reconciliadas, cinco etapas concluídas e validação final aprovada, mas ficou com `reconciled_at=NULL`, `pinned_release=1.4.39` e commit fixado antigo. Sua `current_version` foi atualizada para 1.4.43, criando uma conclusão apenas parcial no Control-plane.
- A causa direta é divergência de contrato no próprio MASTER: `claim_stale_installation_operations` já contém o gate novo da fila, enquanto `finalize_installation_operation` instalada ainda é a versão antiga e não grava reconciliação nem os selos de release/commit.
- Há uma segunda incompatibilidade a corrigir antes de instalar a finalização nova: ela exige fingerprints SHA-256 de 64 caracteres, mas o executor atual grava no ledger operacional o fingerprint legado determinístico. As 93 evidências reais da NXT estão nesse formato. Aplicar a função nova sem corrigir esse contrato faria as próximas instalações falharem na finalização.
- Não há tentativa ativa, lease residual ou executor trabalhando na remessa. A fila está parada de forma estável; nenhuma instalação depois da NXT foi tocada.

## Objetivo

Recuperar a remessa existente sem reaplicar a NXT, preservar todos os checkpoints e fazer Casa 8, Apex, Taveira e unitos-new-teste-02 avançarem estritamente uma por vez, usando o fluxo atual.

## Plano de correção

### 1. Conter e preservar evidências

- Manter a remessa parada enquanto a correção é preparada; não usar “Tentar novamente”, não cancelar operações e não criar nova remessa.
- Registrar um snapshot sanitizado da operação da NXT, das quatro operações pendentes, tentativas, etapas, ledger, baseline, pacote e selos atuais.
- Antes da troca do contrato compartilhado, abrir uma janela curta de manutenção do executor usando o freeze já existente. O preflight deve abortar se surgir qualquer operação ativa não relacionada; nada será apagado ou normalizado como sucesso.

### 2. Corrigir o contrato de finalização no MASTER

- Criar uma migration forward-only do Control-plane que substitua atomicamente a função instalada pela versão compatível com a fila.
- Preservar fencing, lease, vínculo por `active_operation_id`, completude das etapas, total/ordem do ledger, identidade do pacote, release, commit e validação final.
- Ajustar a verificação do fingerprint ao formato realmente produzido pelo executor, em vez de exigir um SHA-256 que nunca é gravado nessa tabela. Não converter evidência inválida, ausente ou ambígua em sucesso.
- Manter permissões atuais: execução somente por `service_role`; nenhuma mudança em RBAC, RLS, autenticação ou privilégios de `anon`/`authenticated`.
- Eliminar a divergência entre migration, script de instalação do Control-plane, bootstrap e verificador, para que o MASTER não possa novamente operar com `claim` novo e `finalize` antigo.

### 3. Reparar somente a conclusão comprovada da NXT

- Fazer uma reconciliação transacional, restrita ao ID da operação atual e à identidade exata `1.4.43 + commit + hash + 93 migrations`.
- Exigir, dentro da própria transação: `status=success`; todas as cinco etapas `done`; flags de banco, código e validação verdadeiras; posições 1–93 sem lacunas; todos os statements concluídos; release e commit observados iguais ao baseline; nenhum lease ou tentativa ativa.
- Somente se todas as condições passarem, preencher `reconciled_at` e alinhar `pinned_release`/`pinned_commit_sha` da NXT. Não executar novamente migrations, Git push, deploy ou validação remota.
- Se qualquer evidência divergir, abortar toda a transação e manter a fila parada para revisão manual.

### 4. Liberar e acompanhar a fila existente

- Rodar o verificador somente leitura ainda sob freeze e confirmar que a finalização atômica e o gate sequencial estão instalados e coerentes.
- Retirar o freeze somente após o PASS integral.
- Deixar o cron atual reivindicar a Casa 8 pelo caminho normal; não alterar manualmente seu status para `running`.
- Para cada instalação, exigir a sequência: claim único → migrations/checkpoints → publicação Git → validação final → finalização atômica → `reconciled_at` e selos corretos → liberação da próxima.
- Pausar imediatamente se qualquer item falhar, bloquear ou perder lease. As instalações seguintes devem continuar pendentes, sem tentativa consumida.

## Testes obrigatórios

- Reproduzir exatamente o incidente em PostgreSQL efêmero: primeiro item finalizado pelo contrato antigo, sem `reconciled_at` e sem atualização dos selos; confirmar que o segundo não é claimado.
- Testar a reparação com três controles derivados dos dados reais:
  1. evidência válida completa — reconcilia e libera somente o segundo item;
  2. evidência ausente ou ledger incompleto — não reconcilia e não libera;
  3. erro/estado ambíguo — falha fechado e preserva o último estado comprovado.
- Executar uma fila real de teste com pelo menos três instalações: provar ordem estrita, nenhuma execução paralela, desbloqueio apenas após reconciliação, bloqueio dos sucessores após falha e retomada sem repetição do predecessor.
- Adicionar testes comportamentais de Postgres para `claim_stale_installation_operations` e `finalize_installation_operation`; os testes atuais de presença de texto não são suficientes.
- Cobrir status, `reconciled_at`, release, commit, baseline malformado, membro ausente, posição ausente, `batchTotal` divergente, lease perdido, clique duplicado e reabertura do painel.
- Rodar testes focados, ensaios PostgreSQL, checagem de tipos, build, `bun run master:check` e suíte global sem aumentar timeout, pular testes ou mascarar falhas.

## Entrega MASTER-first

1. Aplicar código e migration corretiva no MASTER.
2. Regenerar o delta com `build_delta.py`.
3. Sincronizar `delta_version.txt` e `MASTER_RELEASE_VERSION` na nova versão.
4. Atualizar `verify-installation-master.sql` para reprovar a combinação incompatível observada neste incidente e conferir o formato real do ledger.
5. Rodar `bun run master:check` e a suíte global; se o ambiente descartável continuar recusando o token, manter a validação completa como bloqueada.
6. Apresentar a matriz de evidências, versão, SHA, testes, estado da remessa e eventuais bloqueadores.
7. Solicitar autorização explícita para publicar o MASTER corrigido.
8. Solicitar autorização explícita separada para instalar o contrato corrigido e retomar a remessa atual.
9. Acompanhar Casa 8, Apex, Taveira e unitos-new-teste-02 até a validação final e auditar novamente o estado de todas as cinco instalações.

## Limites da intervenção

- Não criar novas rotas, tabelas, campos, filas ou processo paralelo.
- Não alterar dados de negócio, RBAC, RLS, autenticação ou credenciais das instalações.
- Não apagar operações, tentativas, checkpoints ou histórico.
- Não recriar a remessa e não repetir a atualização já executada na NXT.
- Não considerar `current_version=1.4.43` isoladamente como prova de conclusão.
- Não publicar nem retomar instalações sem as duas autorizações explícitas previstas acima.
