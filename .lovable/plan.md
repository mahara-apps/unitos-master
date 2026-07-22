## Problema
Selecionar um cliente no switcher da sidebar não atualiza a tela: se você está em `/customers/<id>` de outro cliente, o `useEffect` daquela rota reforça o `clientId` da URL sobre o que foi escolhido, então o header continua exibindo o cliente antigo. Também não há navegação automática ao trocar de workspace.

## O que muda (apenas `src/components/brand-client-switcher.tsx`)
1. Usar `useRouter`/`useRouterState` de `@tanstack/react-router` para saber a rota atual.
2. Ao selecionar **um cliente**:
   - `setClientId(c.id)`.
   - Se a rota atual estiver sob `/customers/<algumId>...`, navegar para `/customers/<novoId>` (mesma sub-página quando fizer sentido; caso contrário raiz do cliente) com `replace: true`.
   - Se a rota não for de cliente, permanecer onde está — o contexto já basta.
3. Ao selecionar **"Todos os clientes"**:
   - `setClientId(null)`.
   - Se estiver em `/customers/<id>...`, navegar para `/customers` (lista) com `replace: true`.
4. Ao trocar **workspace**:
   - `setBrandId(b.id)` (já limpa `clientId`).
   - Se a rota atual for escopada a cliente (`/customers/<id>...`), navegar para `/dashboard`; caso contrário, apenas invalidar queries.
5. Em todos os casos acima, disparar `qc.invalidateQueries()` para forçar refresh dos dados dependentes de brand/client.

## Fora de escopo
- Alterar `useActiveContext` ou o efeito na rota `customers.$customerId` (o problema é resolvido pela navegação — a rota passa a ser a do cliente escolhido, então o efeito reforça o `clientId` correto).
- Mudanças de UX no popover.
