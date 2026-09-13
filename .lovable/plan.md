# P0 — estabilização de instalação e atualização de ambientes

## Objetivo
Eliminar os bloqueios críticos confirmados no provisionamento e nas atualizações do Unitos, tornando o SQL inicial, as retomadas e o controle de versão determinísticos e seguros. A execução seguirá MASTER-first e não publicará nem reiniciará Taveira, Apex ou outro ambiente sem autorização posterior.

## 1. Corrigir o pacote de instalação nova
- Regenerar o snapshot inicial a partir do estado canônico do MASTER e definir um corte explícito de migrations, para que cada objeto seja criado uma única vez.
- Remover do delta qualquer migration já incorporada ao snapshot, inclusive a segunda criação de `public.installation`.
- Fazer o gerador recusar automaticamente sobreposição entre snapshot e delta, nomes fora de ordem e migrations duplicadas.
- Sanear os privilégios exportados: nenhuma tabela de negócio ficará com `MAINTAIN`, `TRUNCATE` ou outros privilégios para `anon`; preservar somente os acessos públicos deliberados e as RPCs públicas autorizadas.
- Unificar a ordem real do bootstrap, do provisionamento automático, do contrato e da documentação. O arquivo de cron legado com placeholder ficará fora do pacote executável.

## 2. Tornar a aplicação SQL isolada e retomável
- Substituir a fila global `_unitos_deferred_sql` por filas isoladas por operação, arquivo e fingerprint, sem `TRUNCATE` compartilhado.
- Persistir checkpoints por statement e fingerprint, permitindo retomar efeitos parciais sem misturar duas instalações ou repetir comandos já concluídos.
- Registrar SQLSTATE, mensagem sanitizada, arquivo e posição do statement que falhou; dependência realmente não resolvida continuará bloqueando a release.
- Reafirmar lease/fencing durante lotes longos e interromper imediatamente um executor que perdeu o lease.

## 3. Corrigir o ledger de migrations
- Evoluir `_unitos_applied_deltas` para identificar uma migration por arquivo + fingerprint, removendo a limitação que considera apenas o nome do arquivo.
- Validar a transição do ledger legado contra invariantes estruturais antes de marcar migrations históricas como aplicadas.
- No provisionamento novo, registrar no ledger todas as migrations incorporadas/aplicadas, impedindo que o primeiro update repita o delta inteiro.
- Detectar conteúdo alterado sob o mesmo nome e tratá-lo como divergência explícita, nunca como sucesso silencioso.

## 4. Impedir liberação prematura de ambientes
- Manter o ambiente em manutenção enquanto uma atualização estiver pendente, em retry ou com falha.
- Reativar somente depois de banco, código, publicação e health checks concluírem com sucesso para a mesma operação/lease.
- Persistir falhas ao alterar o estado remoto e falhas auxiliares de finalização, em vez de descartá-las silenciosamente.
- Isolar cada claim no worker: uma instalação com erro não interromperá as demais, e todo claim terminará em yield, retry ou estado terminal auditável.

## 5. Segurança e consistência de secrets
- Serializar a geração dos secrets da instalação com operação atômica no MASTER, evitando perda de valores em execuções concorrentes.
- Manter falha fechada para segredo ilegível e nunca registrar valores sensíveis.
- Preservar RBAC/RLS existentes; tabelas auxiliares terão grants explícitos somente para os papéis necessários, RLS e bloqueio de acesso por `anon`.

## 6. Guardiões e testes obrigatórios
- Teste de composição completa `snapshot → delta → storage → seeds → cron` em banco Supabase descartável, incluindo segunda execução idempotente e retomada após interrupções em diferentes pontos.
- Testes concorrentes para fila adiada, lease/fencing, ledger por fingerprint e geração de secrets.
- Testes de upgrade a partir de instalações antigas, provisionamento novo seguido do primeiro update e falha transitória sem saída indevida de manutenção.
- Guardião estático para bloquear: objetos duplicados entre snapshot/delta, grants perigosos para `anon`, SQL com placeholder/meta-comando, migrations fora de ordem e divergência entre ordem/contagens/versão.
- Atualizar `verify-installation.sql` para validar ledger, tabelas auxiliares, RLS/grants, ausência de referências ao MASTER e versão efetivamente instalada.

## 7. Fechamento MASTER-first
1. Aplicar no MASTER apenas as migrations aditivas necessárias ao ledger, atomicidade e observabilidade, com grants/RLS no mesmo arquivo.
2. Regenerar o pacote com `build_delta.py` e revisar o SQL produzido.
3. Avançar a versão do MASTER, sincronizando `delta_version.txt` e `MASTER_RELEASE_VERSION` com o SHA gerado.
4. Atualizar o verificador da instalação e os guardiões de completude.
5. Executar testes focados, integração em Supabase descartável, tipos, build e `bun run master:check`.
6. Conferir o estado final do MASTER e produzir uma lista objetiva dos ambientes ainda bloqueados.
7. Não publicar nem autorizar “Atualizar” em nenhuma instalação sem uma solicitação explícita posterior.

## Fora deste P0
- Melhorias visuais no Gerenciador de Ambientes.
- Polling da listagem, métricas avançadas e refinamentos classificados como P1/P2.
- Reescrita de migrations históricas já aplicadas; correções serão forward-only.
