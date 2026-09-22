# Domínio pendente sem reiniciar o provisionamento

## Objetivo

Permitir que uma instalação tecnicamente concluída finalize com aviso quando o domínio definitivo ainda não puder ser atribuído, usando somente a URL temporária comprovada da Vercel. Uma nova tentativa deve continuar do último checkpoint confiável, sem reaplicar banco, Storage, seeds, secrets, código ou deployment já confirmados.

## Implementação

1. **Separar domínio definitivo de disponibilidade operacional**
   - Manter obrigatória a comprovação do deployment `READY` ligado ao commit esperado.
   - Se a atribuição ou revalidação do domínio definitivo falhar, registrar a causa como pendência externa, não como falha do provisionamento.
   - Usar como URL operacional provisória apenas a URL do projeto/deployment Vercel comprovado; nunca aceitar como prova um domínio ligado a outro projeto.
   - Preservar o domínio definitivo cadastrado para conferência posterior, exibindo-o como pendente até nova validação.

2. **Retomada por checkpoint comprovado**
   - Na criação de um retry terminal, copiar atomicamente apenas o progresso comprovado da operação imediatamente anterior.
   - Exigir mesma instalação, operação anterior `failed`, vínculo `retryOfOperationId`, mesmo pacote selado (`baseline_id` e `baseline_hash`) e formato válido dos checkpoints.
   - Herdar progresso monotônico do baseline e evidências de migrations concluídas. Etapas externas só serão reutilizadas após revalidação dos seus identificadores.
   - Não herdar erro, lease, fencing, tentativa, estado terminal ou dado ambíguo. Leitura com erro falha fechada e nunca vira progresso vazio.

3. **Retomar somente o que falta**
   - No caso atual, reconhecer banco, Storage, seeds, secrets, código e deployment já comprovados.
   - Reprocessar somente a seleção da URL provisória, o registro da pendência do domínio, cron/validação final quando dependentes dessa URL e a conclusão da versão.
   - Manter toda escrita protegida pelas leases e fencing da nova operação; a operação anterior permanece imutável para auditoria.

4. **Interface e histórico**
   - Mostrar a instalação como concluída com atenção quando estiver operacional pela URL temporária e o domínio definitivo estiver pendente.
   - Exibir separadamente a URL temporária ativa, o domínio definitivo pendente e o motivo real devolvido pela Vercel.
   - “Tentar novamente” continuará criando uma nova operação auditável, mas iniciará visual e tecnicamente no checkpoint herdado.

## Testes e garantias

- Reproduzir exatamente o caso observado: deployment correto e domínio `domain_already_in_use`.
- Cobrir domínio atribuído, domínio pendente/409, erro transitório e resposta inválida; somente o domínio fica pendente.
- Cobrir retry com pacote idêntico, hash divergente, checkpoint ausente, leitura com erro e progresso válido.
- Provar que retry compatível não executa novamente `001_initial_schema`, migrations, Storage, seeds, secrets, criação de repositório ou criação de deployment.
- Provar que domínio ligado a outro projeto nunca é usado como evidência da instalação nova.
- Preservar os testes existentes de deployment, commit, RBAC, RLS, autenticação, lease, fencing e finalização fail-closed.
- Executar testes focados, suíte global sem relaxar timeout ou mascarar falhas, typecheck, lint dos arquivos alterados, build e `bun run master:check`.

## MASTER-first e operação atual

- Implementar a mudança mínima no MASTER e na RPC canônica de abertura do retry, sem alterar fluxos já validados fora destes dois pontos.
- Gerar migration pelo fluxo oficial, regenerar delta, sincronizar versão e `MASTER_RELEASE_VERSION`, atualizar a verificação da instalação e selar com `master:check`.
- Não editar nem reabrir as operações existentes e não tocar no banco da instalação durante a implementação.
- Publicar somente com autorização explícita. Depois da publicação, uma autorização separada será necessária para tentar novamente e acompanhar até a validação final.

## Estado confirmado agora

- Não existe operação ativa na Taveira; a tentativa mais recente terminou em falha.
- Essa tentativa já comprovou os sete blocos do baseline, código, variáveis e deployment `READY`, mas encerrou por HTTP 409 ao atribuir o domínio.
- O domínio informado pertence a outro projeto Vercel; por segurança, ele não será tratado como prova do ambiente novo enquanto não for transferido.