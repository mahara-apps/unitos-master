## Diagnóstico (confirmado)

Inspecionei o cache do TanStack Query na tela `/analytics` e a query principal `["analytics", brandId, ...]` está em estado **error** com `Error: forbidden`. As demais (`analytics-team`, `analytics-clients`, `analytics-projects`, `analytics-sla`, `social-analytics`) estão `success` com dados. Por isso o SLA aparece na aba Equipe (usa `analytics-sla`), mas as abas Produção/Equipe/Clientes ficam presas nos skeletons — todas dependem de `analyticsQuery.data`, que nunca chega.

A causa está em `src/lib/analytics.functions.ts` (linhas 95–102): o handler de `getAnalytics` faz um gate manual consultando **somente** `brand_members`. Se o usuário logado é dono da marca (`brands.owner_id`) ou super admin (`user_profiles.is_super_admin`) mas não possui linha em `brand_members`, o check lança `forbidden`. As outras server functions (ex.: `listBrandTeam`) confiam no RLS + bypass de super admin e por isso funcionam para o mesmo usuário.

## Correção

Substituir o gate manual de `getAnalytics` por uma verificação equivalente ao padrão já usado em `team.functions.ts`: aceitar **membro da marca OU dono da marca OU super admin**. Sem essa mudança nenhum super admin/dono sem row em `brand_members` consegue abrir Analytics.

```text
src/lib/analytics.functions.ts (handler de getAnalytics)
  - Manter requireSupabaseAuth
  - Rodar em paralelo:
      * brand_members(brand_id=?, user_id=?) .maybeSingle()
      * brands(id=?) select owner_id .maybeSingle()
      * user_profiles(id=?) select is_super_admin .maybeSingle()
  - Autorizar se: isMember || owner_id === userId || is_super_admin === true
  - Caso contrário: throw new Error("forbidden")
```

Nenhuma outra alteração no arquivo, no UI, ou no schema. As demais queries continuam funcionando pelo RLS.

## Validação

1. Recarregar `/analytics` como o usuário atual.
2. Confirmar via cache do react-query que a query `analytics` sai de `error` para `success`.
3. Percorrer as abas **Social / Produção / Equipe / Clientes** e verificar que os KPIs e gráficos renderizam sem skeleton persistente.
4. Confirmar que usuários sem vínculo (nem membro, nem dono, nem super admin) continuam recebendo `forbidden` (regressão de segurança).
