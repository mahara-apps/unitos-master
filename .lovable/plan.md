# Corrigir retomada da publicação Git

## Objetivo
Garantir que uma nova tentativa de provisionamento nunca recrie um deployment REST quando já existe um commit Git de fallback comprovado, preservando banco, variáveis e etapas concluídas.

## Implementação
- Persistir e herdar somente o commit Git de fallback como evidência externa revalidável; não herdar IDs, estados terminais, lease ou fencing.
- Na retomada, procurar primeiro o deployment Git correspondente ao commit salvo e acompanhar apenas esse deployment.
- Só permitir criação REST quando não houver checkpoint Git e nenhum deployment Git correspondente ao commit autorizado.
- Cobrir os cenários: REST bloqueado seguido de Git READY; nova tentativa herdando o commit Git; retomada sem novo commit nem novo REST; SHA divergente continua bloqueante.
- Atualizar a verificação do MASTER para exigir a herança segura do commit Git, mantendo proibida a herança do ID do deployment.

## Entrega MASTER-first
- Criar a migration canônica no MASTER e atualizar os testes.
- Regenerar delta e contratos, sincronizar a nova versão em todos os artefatos obrigatórios.
- Executar `bun run master:check` e testes focados sem ampliar timeout, pular testes ou mascarar falhas.
- Não publicar nem executar outra tentativa na Apex sem nova autorização explícita.
