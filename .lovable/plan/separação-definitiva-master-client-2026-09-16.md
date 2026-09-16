# Separação definitiva MASTER × Client

## Objetivo
Separar de forma versionada e verificável o plano de controle exclusivo do MASTER do pacote propagado às instalações Client, sem remover objetos legados nem executar operações reais.

## Implementação
1. Criar uma migration MASTER-only idempotente que materialize o estado final auditado do Control Plane: nove tabelas, constraints, índices, triggers, RLS/policies/grants, RPCs duráveis e cron.
2. Adicionar uma fonte única de classificação para as 114 migrations (`control-plane`, `client`, `split`, `unknown`), bloqueando qualquer entrada sem destino explícito e a posição 92.
3. Extrair explicitamente as partes Client das migrations 80, 102 e 103; alterar o gerador para inclusão positiva das 82 Client mais os três fragmentos Client.
4. Remover o pré-requisito incremental de `installation_operations` do caminho Client e garantir que NEW/retry continuem usando o mesmo pacote Client, sem mudança no fluxo UPDATE.
5. Separar a verificação em Client e MASTER; manter compatibilidade do comando existente apenas como adaptador para a verificação Client.
6. Preservar `_unitos_applied_deltas`, checkpoints por operação, monotonicidade, idempotência e retomada; não limpar objetos Control Plane legados em clientes.
7. Criar testes estruturais para classificação, conteúdo do pacote, splits, ausência completa de Control Plane no Client e cobertura integral do MASTER.
8. Executar reconstruções locais isoladas de MASTER vazio e Client vazio quando a infraestrutura disponível suportar PostgreSQL/Supabase compatível; falhar explicitamente se a prova real não puder ser executada.
9. Regenerar o delta, atualizar SHA e versão MASTER-first, conferir manifesto e executar testes focados, instalação, typecheck, lint, build e `master:check`.

## Limites
- Não executar NEW ou retry.
- Não publicar.
- Não tocar Taveira, clientes existentes ou qualquer banco externo.
- Não remover objetos Control Plane já presentes em clientes contaminados.
- Parar e reportar qualquer divergência estrutural não prevista, sem adaptar testes para ocultá-la.

## Resultado esperado
Um MASTER reconstruível a partir da migration canônica e um pacote Client formado exclusivamente pelo conjunto permitido, ambos comprovados por verificações separadas e testes isolados.
