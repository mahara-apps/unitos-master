# Nova área: Mídia Paga — Desempenho (leitura)

## O que a verificação mostrou (fatos)

- O app Meta ("unitos", ID 1647626272966474) responde normalmente às
  requisições de teste e **já solicita** `ads_read` + `business_management` na
  lista padrão de permissões.
- Existe uma autorização gravada em que `ads_read` foi **efetivamente
  concedida** (usuário Bruno Abreu) — logo, ler contas de anúncio, campanhas e
  métricas é viável hoje, sem nova aprovação da Meta.
- As autorizações mais recentes foram feitas pelo caminho "Instagram/Facebook",
  que pede só permissões de página; nessas, anúncios ficam de fora e será
  preciso reautorizar.
- Nenhuma conta de anúncio está gravada (`ad_accounts` vazio em todas as
  autorizações) porque a busca só roda quando a conexão é do tipo "ads".
- O app **não** pede permissão de escrita em anúncios (`ads_management`);
  criar/pausar campanha ou mexer em orçamento exigiria revisão da Meta. Fora
  do escopo desta área.

## Decisões

- Somente leitura e relatórios.
- Contas de anúncio vinculadas a clientes (uma ou mais por cliente).
- Modelo de dados neutro por rede, já preparado para Google Ads; implementação
  agora só de Meta.

## Escopo funcional

1. **Conectar anúncios (workspace)**: no fluxo de conexão Meta, incluir
   `ads_read` também nas autorizações de página, e reaproveitar o portfólio
   para listar as contas de anúncio encontradas.
2. **Vincular ao cliente**: seleção de conta(s) de anúncio por cliente, no
   mesmo padrão já usado para Instagram/Facebook, com aviso claro quando a
   autorização atual não cobre anúncios ("reautorizar para ver anúncios").
3. **Tela de desempenho** (por cliente e visão geral do workspace):
   - Indicadores do período: investimento, impressões, cliques, CTR, CPC, CPM,
     resultados e custo por resultado.
   - Evolução diária, comparação com período anterior (opcional).
   - Tabela por campanha e por conjunto/anúncio, com filtros de período usando
     o fuso oficial America/Sao_Paulo.
   - Estados explícitos: sem conta vinculada, sem permissão, sem dados no
     período, limite de requisições da Meta, erro.
4. **Cache**: leituras persistidas com revalidação em segundo plano e cooldown,
   no mesmo padrão já existente para as APIs Meta, evitando estouro de limite.
5. **Permissões**: Owner/Admin veem o workspace; Manager/User apenas clientes
   atribuídos; cliente no Portal não vê esta área nesta fase.

## Detalhes técnicos

- `src/lib/meta/provider.server.ts`: acrescentar `ads_read` aos conjuntos de
  escopo de `instagram`/`facebook`; novo método de insights
  (`/act_<id>/insights` com `level=campaign|adset|ad`, paginação com teto e
  deadline, telemetria e tratamento de rate limit iguais aos existentes).
- Migration nova (MASTER):
  - `public.ad_accounts` (provider `meta|google`, external_id, nome, moeda,
    fuso, status, brand_id) e `public.client_ad_accounts` (vínculo
    cliente × conta, com unicidade).
  - `public.ad_insights_daily` como cache normalizado por dia/nível/entidade,
    com métricas em colunas neutras e `raw` JSONB.
  - Para cada tabela: `GRANT` para `authenticated`/`service_role`, RLS
    habilitada e políticas de escopo por workspace/cliente reaproveitando as
    funções de acesso existentes.
- Server functions autenticadas em `src/lib/ads/` (`ads.functions.ts` +
  `insights.server.ts`), sem endpoint público; nenhuma chamada Graph no cliente.
- UI: nova rota autenticada `/_authenticated/paid-media.performance` e aba no
  cliente, usando `PageKpi`/`PageKpiGrid` e os componentes de visualização já
  criados no Analytics.
- Item de sidebar dentro do grupo já existente de mídia paga, sem remover nada.
- Testes: escopos por canal, mapeamento de insights, vínculo cliente × conta,
  escopo de leitura por papel, estados de erro/rate limit.

## MASTER-first

Regenerar o pacote delta, atualizar `delta_version.txt` e
`MASTER_RELEASE_VERSION` para a próxima versão, cobrir as três tabelas novas na
verificação 80 de `verify-installation.sql` e rodar `bun run master:check`,
typecheck e build antes de concluir.

## Fora de escopo

Criar/editar/pausar campanhas, orçamento, públicos e qualquer escrita na Meta;
integração real com Google Ads (apenas o modelo fica preparado).
