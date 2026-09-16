# Provisionamento automático da Vercel no NEW

## Implementação

- Reutilizar o cliente Vercel atual e adicionar uma operação idempotente de localizar ou criar o projeto no `UNITOS_VERCEL_TEAM_ID` autorizado.
- Validar que qualquer projeto encontrado pertence ao team esperado; bloquear nomes existentes em outro escopo em vez de adotar ou duplicar.
- Criar o projeto pelo endpoint oficial da Vercel usando o nome da instalação, o repositório GitHub já criado e a branch `main`.
- Confirmar após criação/reuso o ID do projeto, team, vínculo GitHub, branch e auto-deploy antes de configurar variáveis e iniciar o deployment.
- Persistir esses dados em `stageProgress`; retomadas reutilizarão o projeto e o deployment existentes.
- Manter sem alterações a prova final: deployment específico `READY`, SHA autorizado e somente então probe HTTP.
- Traduzir falhas por estágio, incluindo token sem acesso de criação, team incorreto e repositório divergente.

## Verificação de acesso

- Consultar apenas endpoints não destrutivos da Vercel para confirmar identidade do token e acesso ao team configurado.
- Não criar projeto real durante a verificação; se a API não expuser uma permissão consultável, a criação ficará fail-closed e reportará exatamente a autorização exigida.

## Testes e validação

- Cobrir criação, reuso, conflito de team, repositório incorreto, retry sem duplicação, retomada após falha e os estados BUILDING/READY/SHA divergente.
- Executar testes Vercel/NEW, toda a família de instalação, suíte global, typecheck, lint dos arquivos alterados, build e `master:check`.
- Aplicar o ciclo MASTER-first ao código propagável, sem publicar, executar NEW, alterar Supabase ou tocar Taveira/legados.

## Detalhes técnicos

- O endpoint de criação e o payload final serão confirmados contra a documentação oficial antes da edição.
- Os checkpoints continuarão em `installation_operations.detail.stageProgress`; nenhuma migration é prevista.
- O escopo de criação será explícito pelo team configurado; não haverá descoberta heurística para decidir onde criar.