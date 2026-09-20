# Execução definitiva do Unitos Master na infraestrutura existente

## Resultado esperado
Colocar o Control-plane existente e a Apex em operação, preservando dados, histórico, ledgers e a operação pendente. Nenhuma etapa avança sem evidência objetiva da anterior; falhas interrompem somente a etapa afetada.

## Regras operacionais
- Usar exclusivamente o Control-plane e a instalação Apex existentes; não criar instalação ou ambiente paralelo.
- Preservar a operação Apex `7ff64a81-af3d-432f-b3d3-2a1412dda404`; nenhuma exclusão, cancelamento ou alteração ad hoc.
- Manter cron 37 inativo até executor, recovery e validação da Apex estarem concluídos.
- Manter preflight, transação única, advisory locks, leases, heartbeat, fencing, hashes, ACL/RLS e verificadores fail-closed.
- Não falsificar nem remover o gate global de backup. A ausência atual será tratada como etapa a resolver na própria infraestrutura, não como encerramento do trabalho.
- Cada escrita remota exige autorização explícita da etapa correspondente; uma autorização não vale para etapas posteriores.

## Etapas ordenadas

### 1. Congelar a linha de base e revalidar somente por leitura
Confirmar projeto Master, pacote local 1.4.18 e hashes; cron 37 inativo; versões do Control-plane/Apex; ledger 1.4.10/1.4.11/1.4.14; objetos de freeze/executor; estado integral da operação Apex, tentativas, efeitos, migrations, passos e leases.

**PASS:** identidade exata, cron inativo, nenhuma execução concorrente e estado compatível com a sequência conhecida.  
**Se divergir:** interromper antes da primeira escrita e apresentar a divergência concreta.

### 2. Comprovar proteção restaurável no Control-plane existente
Habilitar ou comprovar PITR/backup no próprio projeto Master, sem criar outro ambiente. Registrar projeto, região, retenção, janela UTC, ponto anterior às escritas, operador e evidência verificável. Não aceitar exceção descartável em escopo global.

**PASS:** o gate global aceita evidência real e auditável.  
**Autorização própria:** eventual contratação/ativação de PITR e custo recorrente.  
**Observação:** não será criado clone; a restauração não será executada nesta sequência.

### 3. Instalar o freeze global 1.4.18
Executar somente o instalador selado `--install-global-freeze`, em transação única, após identidade, autorização específica e gate global. Validar duas tabelas, três funções, oito triggers esperados, ACL/RLS e estado inicial inativo.

**PASS:** contrato local e catálogo remoto coincidem; nenhuma operação ou versão foi alterada.  
**Autorização própria:** instalação do freeze.

### 4. Ativar o freeze global
Revalidar zero operações efetivamente em execução. A operação Apex pendente sem lease permanece preservada. Ativar freeze com geração esperada, motivo e operador, usando advisory lock.

**PASS:** `frozen=true`, geração incrementada, evento registrado e mutações operacionais bloqueadas.  
**Autorização própria:** ativação do freeze.

### 5. Instalar e validar o executor determinístico 1.4.18
Executar preflight read-only e o instalador exclusivo `--install-deterministic-update`. Validar assinatura única da RPC, ACL somente `service_role`, lease não expirado, fencing, baseline selado, reconciliação/validação obrigatórias, ledger íntegro e promoção atômica de release/commit.

**PASS:** cinco controles do preflight e verificador Master sem FAIL; freeze continua ativo.  
**Autorização própria:** instalação do executor.

### 6. Executar recovery exclusiva 1.4.14
Rodar o preflight de 17 controles. O staging deve selecionar exclusivamente `20260919143000`; 1.4.10 continua ausente e 1.4.11 não é reaplicada. Revalidar ledger antes e depois do dry-run, hash do staging e ausência de concorrência; executar pela CLI fixada 2.117.0.

**PASS:** ledger final `1.4.10=0, 1.4.11=1, 1.4.14=1`, objetos/ACL/RLS/dependências íntegros.  
**Autorização própria:** recovery 1.4.14.

### 7. Classificar e retomar com segurança a operação Apex existente
Aplicar a política já testada à operação pendente: confirmar que continua sem lease, sem tentativas, efeitos ou migrations e vinculada ao pacote esperado. Reivindicar a mesma operação pelo executor determinístico; não criar nova operação e não editar seu histórico manualmente.

**PASS:** lease/heartbeat/fencing válidos, baseline imutável e transições registradas. Estado incompatível leva a `manual_review` pelo procedimento canônico, nunca a sucesso inferido.  
**Autorização própria:** retomada da operação Apex existente.

### 8. Executar o UPDATE da Apex
Executar etapas do pacote selado com checkpoints e fingerprints. Falha antes/durante migration mantém versão sem promoção; retomada usa o mesmo fencing/baseline. Finalização só ocorre após ledger completo, reconciliação, validação remota e publicação comprovada.

**PASS:** operação terminal `success`; versão aplicada, release e commit promovidos atomicamente; Apex saudável; nenhum checkpoint pendente do pacote.  
**Autorização própria:** UPDATE da Apex e publicação correspondente.

### 9. Desativar o freeze e reativar o cron
Após verificação final do Control-plane e da Apex, desativar freeze com geração esperada. Revalidar executor e ausência de operação órfã; então reativar exclusivamente o job 37 e observar pelo menos um ciclo sem claim indevido.

**PASS:** freeze inativo auditado, cron 37 ativo, operação Apex não repetida, nenhuma fila órfã e painéis coerentes.  
**Autorizações próprias:** desativação do freeze; depois reativação do cron.

## Evidências finais
- Relatório por etapa com horário UTC, ação autorizada, comando/artefato selado, resultado dos preflights e hashes não secretos.
- Estado final de versões, release/commit, ledger, operação Apex, freeze e cron.
- Qualquer divergência real será apresentada no ponto em que ocorrer; não será mascarada nem convertida em sucesso.

## Autorizações necessárias, separadas
1. Ativação/contratação do PITR no Control-plane existente, caso continue ausente.
2. Instalação do freeze.
3. Ativação do freeze.
4. Instalação do executor determinístico.
5. Recovery 1.4.14.
6. Retomada da operação Apex existente.
7. UPDATE/publicação da Apex.
8. Desativação do freeze.
9. Reativação do cron 37.
