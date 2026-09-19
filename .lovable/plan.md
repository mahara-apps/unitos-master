# Corrigir o setup reproduzível da suíte global

## Causa raiz confirmada

- Os setups dos projetos de integração executam apenas limpeza de identidades e workspaces de teste; eles pressupõem que o schema Client já exista.
- O comando da suíte aponta para o projeto descartável, mas não executa nenhum preparo do baseline antes de consultar `public.brands`.
- O mecanismo existente para projeto descartável não está integrado à suíte e depende de uma conexão PostgreSQL separada; o `bootstrap.sh` atual não serve para isso porque delega ao fluxo real NEW/UPDATE.

## Implementação

1. Criar um preparador explícito da suíte global, restrito ao project ref descartável autorizado e bloqueado para o Master ou qualquer alvo divergente.
2. Fazer esse preparador:
   - inspecionar primeiro o estado do destino;
   - não alterar um schema Client já existente;
   - recusar estado parcial ou banco com dados de negócio;
   - em banco realmente vazio, aplicar na ordem oficial os artefatos versionados do pacote Client usando o cliente oficial da Management API e o mesmo saneamento/executor de statements do Master;
   - recarregar o cache do schema e executar a verificação Client read-only antes de liberar os testes.
3. Integrar o preparador antes da limpeza das fixtures, sem criar operação de instalação e sem chamar NEW, UPDATE, retry ou P0.
4. Manter o ensaio P0 fora de qualquer comando executado nesta alteração.
5. Adicionar testes locais para alvo autorizado, bloqueio do Master, schema pronto, banco vazio, estado parcial/dados existentes, ordem canônica e falha de verificação.
6. Registrar a mudança no roadmap e cumprir o versionamento MASTER-first sem alterar os 85 blocos nem o SHA do pacote Client.

## Validação desta etapa

- Executar somente os testes locais do novo setup e os guardiões relacionados.
- Executar `bunx tsgo`, lint focado e `bun run master:check`.
- Não executar a suíte remota, NEW, UPDATE, retry ou o ensaio PostgreSQL P0; apresentar o comando e aguardar autorização separada para qualquer ensaio P0.

## Limites de segurança

- Nenhum SQL avulso/manual será enviado ao banco.
- Nenhum dado de cliente ou instalação existente será alterado.
- Um destino não vazio ou parcialmente preparado falhará fechado, em vez de ser “consertado” automaticamente.
