## Problema

`amISuperAdmin()` (server fn usada por `useIsSuperAdmin`) chama a RPC `is_super_admin(_user_id)`, que só olha `user_profiles.is_super_admin`. Os super admins definidos por e-mail (`apitadadigital@gmail.com`, `jose@mahara.marketing`) **não têm** `user_profiles.is_super_admin = true` — a outra overload `is_super_admin()` (sem argumento) é a que resolve por e-mail via JWT.

Resultado: para esses usuários `superQ.data.isSuperAdmin = false` → o grupo "Super Admin › Feature Flags" nunca é adicionado ao sidebar, e `beforeLoad` da rota `/super-admin/features` também redireciona para `/dashboard`.

## Correção

Unificar a checagem de super admin usando as duas fontes (flag no perfil **ou** e-mail allowlisted no JWT), em um único ponto no servidor.

### Passos

1. **`src/lib/feature-flags.functions.ts` — `amISuperAdmin`**
   - Trocar a RPC para chamar `is_super_admin()` (overload sem argumento, que já combina JWT-email). Se preferir defensivo: chamar as duas overloads e retornar `true` se qualquer uma for verdadeira.
   - Manter o retorno `{ isSuperAdmin: boolean }` (sem mudança de contrato para o hook).

2. **`assertSuperAdmin` no mesmo arquivo**
   - Aplicar a mesma lógica (`is_super_admin()` sem argumento, ou OR das duas) para não travar escritas de `setBrandFeature` / `listBrandsWithFeatureCounts` para super admins por e-mail.

3. **Verificação**
   - Build + abrir `/dashboard` logado como `apitadadigital@gmail.com`: sidebar deve mostrar grupo "Super Admin" com "Feature Flags".
   - Abrir `/super-admin/features`: página carrega, lista marcas e permite toggles.
   - Usuário comum continua sem ver o grupo (comportamento inalterado).

## Fora de escopo

- Não vamos alterar as RPCs SQL nem criar `user_profiles` para os e-mails allowlisted (mantém a allowlist por JWT como fonte adicional de verdade).
- Nenhuma mudança em RLS/policies (a camada de RLS já usa a versão por e-mail via helpers `is_brand_member`/`has_brand_role` patchados anteriormente).